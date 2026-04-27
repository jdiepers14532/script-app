import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AppShell from '../components/AppShell'

// ── Farben ────────────────────────────────────────────────────────────────────
const C = {
  blue:    '#007AFF',
  green:   '#00C853',
  orange:  '#FF9500',
  purple:  '#AF52DE',
  red:     '#FF3B30',
  gray:    '#757575',
  border:  'var(--border)',
  surface: 'var(--bg-surface)',
  subtle:  'var(--bg-subtle)',
  text:    'var(--text-primary)',
  muted:   'var(--text-secondary)',
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-block',
      background: color + '22',
      color,
      border: `1px solid ${color}55`,
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 600,
      padding: '1px 6px',
      fontFamily: 'monospace',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function Tag({ ok }: { ok?: boolean }) {
  return ok !== false
    ? <span style={{ color: C.green, fontSize: 11, fontWeight: 700 }}>✓</span>
    : <span style={{ color: C.orange, fontSize: 11, fontWeight: 700 }}>⚠</span>
}

function TableCard({ title, color, fields, note }: {
  title: string
  color: string
  note?: string
  fields: { name: string; type: string; desc: string; ok?: boolean }[]
}) {
  return (
    <div style={{
      border: `2px solid ${color}`,
      borderRadius: 10,
      overflow: 'hidden',
      background: C.surface,
      fontSize: 12,
    }}>
      <div style={{
        background: color,
        color: '#fff',
        fontWeight: 700,
        fontSize: 12,
        padding: '7px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        letterSpacing: 0.3,
      }}>
        <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>TABLE</span>
        <span>{title}</span>
      </div>
      {note && (
        <div style={{ padding: '6px 12px', background: color + '18', fontSize: 11, color: C.muted, borderBottom: `1px solid ${color}33` }}>
          {note}
        </div>
      )}
      <div>
        {fields.map((f, i) => (
          <div key={f.name} style={{
            display: 'grid',
            gridTemplateColumns: '160px 100px 1fr 18px',
            gap: 6,
            padding: '5px 12px',
            borderBottom: i < fields.length - 1 ? `1px solid ${C.border}` : undefined,
            alignItems: 'center',
          }}>
            <code style={{ fontSize: 11, color: color, fontWeight: 600 }}>{f.name}</code>
            <span style={{ fontSize: 10, color: C.muted, fontFamily: 'monospace' }}>{f.type}</span>
            <span style={{ fontSize: 11, color: C.text }}>{f.desc}</span>
            {f.ok !== undefined && <Tag ok={f.ok} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function Arrow({ label }: { label?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '4px 0', color: C.muted, fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 18, lineHeight: 1, color: C.gray }}>↓</span>
      {label && <span style={{ fontSize: 10 }}>{label}</span>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0', paddingBottom: 8, borderBottom: `2px solid ${C.border}` }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

// ── Offline-Modus Tab ─────────────────────────────────────────────────────────
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
              label: 'Offline · X ausstehend',
              desc: 'Keine Internetverbindung. Deine Änderungen werden lokal gespeichert und übertragen, sobald die Verbindung zurückkehrt.',
              icon: '✗',
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

      {/* Troubleshooting */}
      <Section title="5. Probleme beheben">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
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

      {/* Technische Details (collapsible) */}
      <Section title="6. Technische Details">
        <details style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <summary style={{
            padding: '12px 16px', cursor: 'pointer',
            fontWeight: 600, fontSize: 12,
            background: C.subtle, listStyle: 'none',
          }}>
            Für Entwickler — Implementierungsdetails
          </summary>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 12, color: C.muted }}>
              <strong style={{ color: C.text }}>Service Worker (VitePWA + Workbox)</strong> — <code>registerType: 'autoUpdate'</code>
            </div>
            <div style={{ background: C.subtle, borderRadius: 6, padding: 12, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8 }}>
              <div><Badge color={C.purple}>NetworkFirst</Badge> <code style={{ color: C.muted }}>/api/staffeln</code> — 10s Timeout → Cache Fallback</div>
              <div><Badge color={C.purple}>NetworkFirst</Badge> <code style={{ color: C.muted }}>/api/episoden</code> — 10s Timeout → Cache Fallback</div>
              <div><Badge color={C.orange}>StaleWhileRevalidate</Badge> <code style={{ color: C.muted }}>/api/szenen</code> — Cache sofort, Update im BG</div>
              <div><Badge color={C.blue}>CacheFirst</Badge> <code style={{ color: C.muted }}>*.js *.css *.html *.woff2</code> — App Shell immer lokal</div>
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              <strong style={{ color: C.text }}>Write Queue</strong> — <code>useOfflineQueue</code> Hook, IndexedDB Store: <code>script-offline-queue / requests</code>
            </div>
            <div style={{ background: C.subtle, borderRadius: 6, padding: 12, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8 }}>
              <div><code style={{ color: C.blue }}>enqueue(method, url, body)</code> → speichert <code>{`{id, method, url, body, timestamp}`}</code></div>
              <div><code style={{ color: C.green }}>window.addEventListener('online')</code> → <code>syncQueue()</code> automatisch</div>
              <div>Sync: jede Anfrage der Reihe nach, erfolgreich → aus Queue löschen</div>
            </div>
          </div>
        </details>
      </Section>
    </div>
  )
}

// ── Szenen-Nummerierung Tab ───────────────────────────────────────────────────
function NummerierungTab() {
  return (
    <div>

      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}18 0%, ${C.purple}12 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🔢</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Szenen-Nummerierung & Revisions-Logging</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Die Script-App unterscheidet zwei Modi: <strong>freies Nummerieren</strong> (Entwicklungsphase)
            und <strong>geloggte Nummerierung</strong> (nach Abgabe). Der Wechsel ist einmalig und nicht umkehrbar —
            wie in Final Draft oder der WGA-Norm.
          </div>
        </div>
      </div>

      {/* ── 1. Zwei Modi ── */}
      <Section title="1. Zwei Modi: frei vs. geloggt">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Modus A */}
          <div style={{ border: `2px solid ${C.green}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: C.green, color: '#fff', padding: '10px 14px', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>✏️</span> Frei (Entwicklung)
            </div>
            <div style={{ padding: '14px 16px', background: C.green + '0a' }}>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                <div>• Szenen können beliebig umsortiert werden</div>
                <div>• „Neu nummerieren" zählt 1, 2, 3 … durch</div>
                <div>• Keine Positions-Protokollierung</div>
                <div>• Szenennummern können jederzeit geändert werden</div>
              </div>
              <div style={{ marginTop: 10, padding: '6px 10px', background: C.green + '18', borderRadius: 6, fontSize: 11, color: C.green, fontWeight: 600 }}>
                Standard in der Entwicklungsphase
              </div>
            </div>
          </div>

          {/* Modus B */}
          <div style={{ border: `2px solid ${C.orange}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: C.orange, color: '#fff', padding: '10px 14px', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🔒</span> Geloggt (nach Abgabe)
            </div>
            <div style={{ padding: '14px 16px', background: C.orange + '0a' }}>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
                <div>• Szenennummern sind eingefroren</div>
                <div>• Positionsänderungen werden in Szeneninfo protokolliert</div>
                <div>• Neue Szenen erhalten Suffix: 5a, 5b …</div>
                <div>• Textänderungen werden mit * markiert</div>
              </div>
              <div style={{ marginTop: 10, padding: '6px 10px', background: C.orange + '18', borderRadius: 6, fontSize: 11, color: C.orange, fontWeight: 600 }}>
                Ab Abgabe — einmalig aktiviert
              </div>
            </div>
          </div>
        </div>

        {/* Aktivierungs-Schalter */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden',
        }}>
          <div style={{ flex: 1, padding: '14px 18px', background: C.green + '0a', borderRight: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 4, fontWeight: 600 }}>VOR ABGABE</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Nicht geloggt</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}><code>logged_since = NULL</code></div>
          </div>
          <div style={{ padding: '0 20px', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 20, color: C.orange }}>→</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2, whiteSpace: 'nowrap' }}>Abgabe (einmalig)</div>
          </div>
          <div style={{ flex: 1, padding: '14px 18px', background: C.orange + '0a', borderLeft: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.orange, marginBottom: 4, fontWeight: 600 }}>NACH ABGABE</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Geloggt</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}><code>logged_since = NOW()</code></div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: C.muted, padding: '8px 12px', background: C.subtle, borderRadius: 6 }}>
          <strong>Admin → Einstellungen:</strong> <code>scene_logging_stage</code> legt fest, bei welcher Fassung das Logging aktiviert wird
          (expose / treatment / draft / final). Standard: <code>none</code> — manuell per API-Aufruf.
        </div>
      </Section>

      {/* ── 2. Drag & Drop ── */}
      <Section title="2. Szenen sortieren — Drag & Drop">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          In der Szenen-Sidebar kannst du Szenen per Klick-halten + Ziehen umsortieren.
          Die neue Reihenfolge wird sofort gespeichert.
        </p>

        {/* Visuelle Demo */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 20 }}>
          {/* Sidebar-Mockup */}
          <div style={{ width: 200, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', flexShrink: 0, fontSize: 12 }}>
            <div style={{ padding: '7px 10px', background: C.subtle, borderBottom: `1px solid ${C.border}`, fontWeight: 600, fontSize: 11, color: C.muted }}>
              SZENEN
            </div>
            {[
              { num: '1', loc: 'WOHNZIMMER', active: false, drag: false },
              { num: '2', loc: 'KÜCHE', active: false, drag: true },
              { num: '3', loc: 'FLUR', active: true, drag: false },
              { num: '4', loc: 'GARTEN', active: false, drag: false },
            ].map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 10px',
                background: s.drag ? C.orange + '15' : s.active ? C.subtle : 'transparent',
                borderBottom: `1px solid ${C.border}`,
                opacity: s.drag ? 0.5 : 1,
                borderLeft: s.drag ? `3px solid ${C.orange}` : s.active ? `3px solid ${C.text}` : '3px solid transparent',
                cursor: 'grab',
              }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, width: 16, textAlign: 'center' }}>{s.num}</span>
                <span style={{ fontSize: 11, color: s.active ? C.text : C.muted }}>{s.loc}</span>
                {s.drag && <span style={{ marginLeft: 'auto', fontSize: 10, color: C.orange }}>↕</span>}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: '☝️', title: 'Klick & Halten', desc: 'Klicke auf eine Szene und halte die Maustaste gedrückt, um sie zu greifen.' },
              { icon: '↕️', title: 'Ziehen', desc: 'Ziehe die Szene zur gewünschten Position. Die Zielzeile wird mit einem blauen Strich markiert.' },
              { icon: '🖱️', title: 'Loslassen', desc: 'Beim Loslassen wird die neue Reihenfolge gespeichert. Wenn Logging aktiv ist, wird die alte Position in der Szeneninfo notiert.' },
              { icon: '🔍', title: 'Suchfilter aktiv', desc: 'Drag & Drop ist deaktiviert, solange ein Suchbegriff eingegeben ist.', warn: true },
            ].map((s, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, padding: '10px 14px',
                border: `1px solid ${s.warn ? C.orange + '44' : C.border}`,
                borderLeft: `3px solid ${s.warn ? C.orange : C.blue}`,
                borderRadius: 8,
                background: s.warn ? C.orange + '08' : 'transparent',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 2 }}>{s.title}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── 3. Neu nummerieren ── */}
      <Section title="3. Neu nummerieren">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Das Kontextmenü-Symbol <strong>⋮</strong> neben dem <strong>+</strong>-Button öffnet das Header-Menü der Sidebar.
          Dort findet sich der Befehl „Neu nummerieren".
        </p>

        {/* Kontextmenü-Bild */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 20 }}>
          {/* Mockup Menü */}
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: 600 }}>HEADER-MENÜ</div>
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 160,
            }}>
              <div style={{ padding: '7px 10px', fontSize: 12, borderRadius: 5, background: C.subtle, cursor: 'default', fontWeight: 600 }}>
                Neu nummerieren
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 10, color: C.muted }}>⋮ → erscheint neben dem + Button</div>
          </div>

          {/* Verhalten je nach Modus */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ border: `1px solid ${C.green}44`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: C.green + '18', borderBottom: `1px solid ${C.green}33`, fontSize: 12, fontWeight: 700, color: C.green }}>
                Logging AUS (freie Phase)
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  {/* Vorher */}
                  <div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, fontWeight: 600 }}>VORHER (sort_order)</div>
                    {['3 · KÜCHE', '1 · GARTEN', '5 · FLUR', '2 · VILLA'].map((l, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '3px 8px', borderLeft: `2px solid ${C.border}`, marginBottom: 3, color: C.muted }}>{l}</div>
                    ))}
                  </div>
                  <div style={{ fontSize: 24, color: C.green }}>→</div>
                  {/* Nachher */}
                  <div>
                    <div style={{ fontSize: 10, color: C.green, marginBottom: 6, fontWeight: 600 }}>NACHHER</div>
                    {['1 · KÜCHE', '2 · GARTEN', '3 · FLUR', '4 · VILLA'].map((l, i) => (
                      <div key={i} style={{ fontSize: 12, padding: '3px 8px', borderLeft: `2px solid ${C.green}`, marginBottom: 3, color: C.text, fontWeight: 600 }}>{l}</div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: C.muted }}>Szenen werden 1, 2, 3 … neu durchgezählt. Suffixe werden gelöscht.</div>
              </div>
            </div>

            <div style={{ border: `1px solid ${C.orange}44`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '8px 12px', background: C.orange + '18', borderBottom: `1px solid ${C.orange}33`, fontSize: 12, fontWeight: 700, color: C.orange }}>
                Logging AN (nach Abgabe)
              </div>
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                  Nummern bleiben unverändert. Szenen, die von ihrer Szenennummer-Reihenfolge abweichen,
                  erhalten einen automatischen Eintrag in der Szeneninfo:
                </div>
                <div style={{ marginTop: 8, padding: '8px 10px', background: C.subtle, borderRadius: 6, fontFamily: 'monospace', fontSize: 11, color: C.muted }}>
                  [27.04.2026] Neu nummeriert: steht jetzt zwischen Szene 4 und Szene 6
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── 4. Szenen einfügen ── */}
      <Section title="4. Szenen einfügen — Suffix-System">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Im Kontextmenü jeder Szene (⋯ am rechten Rand) gibt es den Befehl <strong>„Einfügen darunter"</strong>.
          Das Verhalten hängt davon ab, ob das Logging aktiv ist.
        </p>

        {/* Suffix-Visualisierung */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Ohne Logging */}
          <div style={{ border: `1px solid ${C.green}44`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: C.green + '18', fontSize: 12, fontWeight: 700, color: C.green, borderBottom: `1px solid ${C.green}33` }}>
              Logging AUS
            </div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Neue Szene bekommt sort_order nach der gewählten Szene:</div>
              {[
                { num: '4', suf: '', loc: 'VILLA', highlight: false },
                { num: '5', suf: '', loc: 'NEUE SZENE', highlight: true },
                { num: '6', suf: '', loc: 'MARKT', highlight: false },
              ].map((s, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, padding: '6px 8px',
                  borderRadius: 6, marginBottom: 4,
                  background: s.highlight ? C.green + '18' : 'transparent',
                  border: s.highlight ? `1px solid ${C.green}44` : '1px solid transparent',
                }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: s.highlight ? C.green : C.text, minWidth: 28 }}>
                    {s.num}{s.suf}
                  </span>
                  <span style={{ fontSize: 12, color: s.highlight ? C.green : C.muted }}>{s.loc}</span>
                  {s.highlight && <span style={{ marginLeft: 'auto', fontSize: 10, color: C.green, fontWeight: 700 }}>NEU</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Mit Logging */}
          <div style={{ border: `1px solid ${C.orange}44`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: C.orange + '18', fontSize: 12, fontWeight: 700, color: C.orange, borderBottom: `1px solid ${C.orange}33` }}>
              Logging AN — Suffix-Vergabe (WGA-Standard)
            </div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
                Die Szenennummer der Vorgänger-Szene bleibt. Die neue Szene bekommt den nächsten freien Buchstaben:
              </div>
              {[
                { num: '5', suf: '',  loc: 'KÜCHE',      highlight: false },
                { num: '5', suf: 'a', loc: 'NEUE SZENE', highlight: true },
                { num: '6', suf: '',  loc: 'FLUR',        highlight: false },
              ].map((s, i) => (
                <div key={i} style={{
                  display: 'flex', gap: 8, padding: '6px 8px',
                  borderRadius: 6, marginBottom: 4,
                  background: s.highlight ? C.orange + '18' : 'transparent',
                  border: s.highlight ? `1px solid ${C.orange}44` : '1px solid transparent',
                }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: s.highlight ? C.orange : C.text, minWidth: 28 }}>
                    {s.num}<strong style={{ color: C.orange }}>{s.suf}</strong>
                  </span>
                  <span style={{ fontSize: 12, color: s.highlight ? C.orange : C.muted }}>{s.loc}</span>
                  {s.highlight && <span style={{ marginLeft: 'auto', fontSize: 10, color: C.orange, fontWeight: 700 }}>NEU</span>}
                </div>
              ))}
              <div style={{ marginTop: 10, padding: '6px 10px', background: C.subtle, borderRadius: 6, fontSize: 11, color: C.muted }}>
                Weitere Szenen erhalten 5b, 5c, 5d … — Buchstaben a–z verfügbar.
              </div>
            </div>
          </div>
        </div>

        {/* Kontext-Menü Mockup */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, fontWeight: 600 }}>ZEILEN-MENÜ (⋯)</div>
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 4, minWidth: 160,
            }}>
              <div style={{ padding: '7px 10px', fontSize: 12, borderRadius: 5, fontWeight: 600, background: C.subtle }}>Einfügen darunter</div>
              <div style={{ padding: '7px 10px', fontSize: 12, borderRadius: 5, color: C.red }}>Löschen</div>
            </div>
          </div>
          <div style={{ flex: 1, fontSize: 12, color: C.muted, lineHeight: 1.7, padding: '10px 0' }}>
            <div>• Das Zeilen-Menü erscheint beim Hover auf eine Szene (⋯ rechts außen).</div>
            <div>• Suffix-Szenen sind vorerst selbst <em>nicht</em> geloggt — sie werden beim nächsten Abgabe-Schalter erfasst.</div>
            <div>• Eine Suffix-Szene bleibt immer direkt hinter ihrer Mutter-Szene in der sort_order.</div>
          </div>
        </div>
      </Section>

      {/* ── 5. Szeneninfo ── */}
      <Section title="5. Szeneninfo — Positions-Protokoll">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Das Feld <code>szeneninfo</code> ist ein frei editierbares Textfeld pro Szene.
          Es dient gleichzeitig als automatisches Positions-Protokoll, wenn das Logging aktiv ist.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ border: `1px solid ${C.blue}44`, borderRadius: 8, padding: '12px 14px', background: C.blue + '06' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.blue, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>ℹ️</span> Manueller Eintrag
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Drehbuch-Autorinnen können eigene Notizen zur Szene eintragen —
              z.B. dramaturgische Hinweise, Casting-Wünsche oder Herkunft einer Szene.
            </div>
          </div>
          <div style={{ border: `1px solid ${C.orange}44`, borderRadius: 8, padding: '12px 14px', background: C.orange + '06' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.orange, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>📋</span> Automatisches Log
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Bei aktiviertem Logging wird jede Positionsänderung automatisch als Zeile angehängt.
              Manueller Text und Auto-Log koexistieren im selben Feld.
            </div>
          </div>
        </div>

        {/* Beispiel-Log */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', background: C.subtle, borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 600, color: C.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>ℹ️</span> szeneninfo · Szene 7
          </div>
          <div style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
            <div style={{ color: C.text }}>Ursprünglich als Einleitungsszene geplant, jetzt Auflösung des A-Plots.</div>
            <div style={{ color: C.orange, marginTop: 4 }}>[15.04.2026] Position geändert: jetzt zwischen Szene 6 und Szene 8</div>
            <div style={{ color: C.orange }}>[22.04.2026] Neu nummeriert: steht jetzt zwischen Szene 6a und Szene 8</div>
            <div style={{ color: C.orange }}>[27.04.2026] Position geändert: jetzt zwischen Szene 6a und Szene 7a</div>
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
          Das Info-Icon <strong>ℹ</strong> erscheint in der Sidebar neben Szenen mit Szeneninfo-Eintrag.
          Hover zeigt den vollständigen Text als Tooltip.
        </div>
      </Section>

      {/* ── 6. Textänderungen-Markierung ── */}
      <Section title="6. Textänderungen — Revisions-Markierung (*)">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Nach der Abgabe werden Textänderungen an geloggten Szenen markiert —
          analog zu Final Draft und dem WGA-Standard für Revisionsfassungen (Rote Seiten, Blaue Seiten …).
        </p>

        {/* Vergleich Vorher/Nachher */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 8 }}>ORIGINAL (freigegeben)</div>
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px',
              fontFamily: 'monospace', fontSize: 12, lineHeight: 2, background: C.surface,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, color: C.muted, letterSpacing: 1 }}>7. INT. KÜCHE - TAG</div>
              <div style={{ color: C.muted, fontSize: 11 }}>ANNA steht am Herd.</div>
              <div style={{ marginTop: 6, fontSize: 11 }}><strong>ANNA</strong></div>
              <div style={{ fontSize: 11, color: C.muted, paddingLeft: 16 }}>Wo ist das Salz?</div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.red, marginBottom: 8 }}>NACH ÄNDERUNG (geloggt)</div>
            <div style={{
              border: `1px solid ${C.red}55`, borderRadius: 8, padding: '14px 16px',
              fontFamily: 'monospace', fontSize: 12, lineHeight: 2, background: C.red + '04',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 11, color: C.muted, letterSpacing: 1 }}>7. INT. KÜCHE - TAG</div>
              <div style={{ color: C.muted, fontSize: 11 }}>ANNA steht am Herd. <span style={{ background: C.red + '33', color: C.red, padding: '0 3px', borderRadius: 2, fontWeight: 700 }}>Sie rührt unruhig.</span></div>
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <strong>ANNA</strong>
                <span style={{ marginLeft: 8, color: C.red, fontWeight: 700, fontSize: 13 }}>*</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, paddingLeft: 16 }}>
                <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>Wo ist das Salz?</span>
                {' '}
                <span style={{ color: C.red, fontWeight: 600 }}>Hat jemand das Salz gesehen?</span>
                <span style={{ marginLeft: 6, color: C.red, fontWeight: 700, fontSize: 13 }}>*</span>
              </div>
            </div>
          </div>
        </div>

        {/* Regeln */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            {
              icon: '*',
              color: C.red,
              title: 'Sternchen-Markierung',
              desc: 'Jeder geänderte Textblock erhält am rechten Rand ein *. Standard in der Filmindustrie seit den 1930er Jahren.',
            },
            {
              icon: '△',
              color: C.orange,
              title: 'Geänderte Zeilen',
              desc: 'Zusätzlich zur Sternchen-Markierung können geänderte Zeilen farbig hinterlegt werden — konfigurierbar pro Revisions-Farbe.',
            },
            {
              icon: '→',
              color: C.blue,
              title: 'Revisionsfassungen (Rote Seiten)',
              desc: 'Ab der nächsten Version oder Revision werden auch neue Suffix-Szenen (5a, 5b …) in das Logging einbezogen. Jede Revisionsstufe hat eine eigene Farbe (Weiß → Blau → Pink → Gelb → Grün …).',
            },
            {
              icon: '◎',
              color: C.purple,
              title: 'Delta-Tabelle',
              desc: 'Alle Änderungen werden in szenen_revisionen gespeichert: field_type, old_value, new_value — für Vergleich und Export.',
            },
          ].map((s, i) => (
            <div key={i} style={{
              display: 'flex', gap: 14, padding: '10px 14px',
              border: `1px solid ${s.color}33`, borderLeft: `3px solid ${s.color}`,
              borderRadius: 8, background: s.color + '06',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: s.color + '22', color: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 900, fontSize: 13, flexShrink: 0, fontFamily: 'monospace',
              }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. Eindeutigkeit ── */}
      <Section title="7. Eindeutigkeit einer Szene">
        <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>
          Eine Szenennummer allein reicht nicht zur Identifikation — sie beginnt in jeder Folge bei 1.
          Die eindeutige Adresse einer Szene besteht immer aus drei Bestandteilen:
        </p>
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch', border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          {[
            { label: 'Folge', value: '3452', color: C.blue, desc: 'folge_nummer (via stage)' },
            { label: 'Nummer', value: '7', color: C.orange, desc: 'scene_nummer (INT)' },
            { label: 'Suffix', value: 'a', color: C.purple, desc: 'scene_nummer_suffix (optional)', optional: true },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, borderRight: i < 2 ? `1px solid ${C.border}` : undefined }}>
              <div style={{ background: s.color, color: '#fff', padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>
                {s.label.toUpperCase()}
                {s.optional && <span style={{ opacity: 0.7, marginLeft: 6 }}>(optional)</span>}
              </div>
              <div style={{ padding: '12px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4, fontFamily: 'monospace' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 14px', background: C.subtle, borderRadius: 8, fontFamily: 'monospace', fontSize: 13 }}>
          Folge <strong style={{ color: C.blue }}>3452</strong> · Szene <strong style={{ color: C.orange }}>7</strong><strong style={{ color: C.purple }}>a</strong>
          <span style={{ color: C.muted, fontSize: 11, marginLeft: 16 }}>→ eindeutige Adresse, auch wenn Szene die Folge wechselt</span>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: C.muted }}>
          Szenen können in seltenen Fällen die Folge wechseln. Die Adresse bleibt dann gültig, weil Folge + Nummer + Suffix gemeinsam identifizieren.
        </div>
      </Section>

      {/* ── 8. Cheatsheet ── */}
      <Section title="8. Schnellreferenz">
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
        }}>
          {[
            { key: '⋮ → Neu nummerieren',    cond: 'Logging AUS',  result: '1, 2, 3 …',          color: C.green },
            { key: '⋮ → Neu nummerieren',    cond: 'Logging AN',   result: 'Position in Szeneninfo', color: C.orange },
            { key: '⋯ → Einfügen darunter', cond: 'Logging AUS',  result: 'Neue Szene, sort_order', color: C.green },
            { key: '⋯ → Einfügen darunter', cond: 'Logging AN',   result: 'Suffix: 5a, 5b …',    color: C.orange },
            { key: 'Drag & Drop',            cond: 'immer',        result: 'sort_order aktualisiert', color: C.blue },
            { key: 'Drag & Drop',            cond: 'Logging AN',   result: '+ Szeneninfo-Eintrag', color: C.orange },
            { key: 'ℹ Icon in Sidebar',      cond: 'szeneninfo ≠ leer', result: 'Hover → Tooltip',  color: C.blue },
            { key: 'Textänderung',           cond: 'Logging AN',   result: '* Markierung',         color: C.red },
            { key: 'Abgabe-Schalter',        cond: 'einmalig',     result: 'logged_since = NOW()', color: C.purple },
          ].map((r, i) => (
            <div key={i} style={{
              border: `1px solid ${r.color}33`,
              borderRadius: 8, padding: '10px 12px',
              background: r.color + '06',
            }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: r.color, marginBottom: 4 }}>{r.key}</div>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 5 }}>wenn: {r.cond}</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>→ {r.result}</div>
            </div>
          ))}
        </div>
      </Section>

    </div>
  )
}

function HilfePage() {
  const [activeTab, setActiveTab] = useState<'offline' | 'datenmodell' | 'nummerierung'>('offline')
  const navigate = useNavigate()

  return (
    <AppShell hideProductionSelector>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '32px 40px',
        maxWidth: 900,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}>

        {/* Page header */}
        <div style={{ marginBottom: 28 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.muted, fontSize: 13, padding: '0 0 12px 0',
            }}
          >
            ← Zurück
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px 0' }}>Handbuch</h1>
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
            Dokumentation und Anleitungen zur Script-App.
          </p>
        </div>

        {/* Tab navigation */}
        <div style={{
          display: 'flex',
          gap: 2,
          marginBottom: 32,
          borderBottom: `2px solid ${C.border}`,
        }}>
          {([
            { id: 'offline',      label: 'Offline-Modus',        icon: '📶' },
            { id: 'nummerierung', label: 'Szenen & Nummerierung', icon: '🔢' },
            { id: 'datenmodell',  label: 'Datenmodell',           icon: '🗄️' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 18px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 400,
                color: activeTab === tab.id ? C.text : C.muted,
                borderBottom: activeTab === tab.id ? `2px solid ${C.blue}` : '2px solid transparent',
                marginBottom: -2,
                borderRadius: '4px 4px 0 0',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                transition: 'color 0.15s',
              }}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'offline' && <OfflineTab />}

        {activeTab === 'nummerierung' && <NummerierungTab />}

        {activeTab === 'datenmodell' && (
          <div>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0' }}>Datenmodell — Script-App</h2>
              <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>
                Wie Drehbuchdaten in der PostgreSQL-Datenbank <code>script_db</code> strukturiert sind.
              </p>
            </div>

        {/* ── 1. Hierarchie ── */}
        <Section title="1. Hierarchie">
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
            Jede Produktion ist eine <strong>Staffel</strong>. Eine Staffel hat beliebig viele <strong>Fassungen</strong> (Stages) —
            z.B. Treatment v6 und Drehbuch v6. Eine Fassung enthält die <strong>Szenen</strong> dieser Folge.
            Block- und Folgen-Metadaten kommen direkt aus der Produktionsdatenbank.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', maxWidth: 560 }}>

            {/* Staffel */}
            <TableCard
              title="staffeln"
              color={C.blue}
              note="Eine Produktion / Serie (z.B. Rote Rosen)"
              fields={[
                { name: 'id',              type: 'TEXT PK',   desc: 'Slug, z.B. rote-rosen' },
                { name: 'titel',           type: 'TEXT',      desc: 'Anzeigename' },
                { name: 'show_type',       type: 'TEXT',      desc: "daily_soap | weekly | movie" },
                { name: 'produktion_db_id',type: 'UUID',      desc: 'Verknüpfung zur Produktionsdatenbank' },
                { name: 'meta_json',       type: 'JSONB',     desc: 'Erweiterbare Metadaten' },
              ]}
            />

            <Arrow label="1 : n" />

            {/* folgen_meta */}
            <TableCard
              title="folgen_meta"
              color={C.purple}
              note="Script-eigene Metadaten pro Folge (Episodennummer aus ProdDB)"
              fields={[
                { name: 'staffel_id',   type: 'TEXT FK',  desc: 'Staffel' },
                { name: 'folge_nummer', type: 'INT',      desc: 'Episodennummer (aus ProdDB übernommen)' },
                { name: 'arbeitstitel', type: 'TEXT',     desc: 'Folgen-Arbeitstitel' },
                { name: 'air_date',     type: 'DATE',     desc: 'Ausstrahlungsdatum' },
                { name: 'synopsis',     type: 'TEXT',     desc: 'Folgen-Synopsis' },
              ]}
            />

            <Arrow label="1 : n" />

            {/* stages */}
            <TableCard
              title="stages"
              color={C.orange}
              note="Eine Fassung einer Folge — z.B. Treatment v6 | Drehbuch v6"
              fields={[
                { name: 'id',             type: 'SERIAL PK', desc: 'Interne ID' },
                { name: 'staffel_id',     type: 'TEXT FK',   desc: 'Staffel' },
                { name: 'folge_nummer',   type: 'INT',       desc: 'Zu welcher Folge gehört diese Fassung' },
                { name: 'proddb_block_id',type: 'UUID',      desc: 'Block-ID aus der Produktionsdatenbank' },
                { name: 'stage_type',     type: 'TEXT',      desc: "expose | treatment | draft | final" },
                { name: 'version_nummer', type: 'INT',       desc: 'Versionszähler (v1, v2 …)' },
                { name: 'version_label',  type: 'TEXT',      desc: 'Freier Label (z.B. Drehfassung, Endfassung)' },
                { name: 'status',         type: 'TEXT',      desc: 'in_arbeit | review | freigegeben | archiviert' },
                { name: 'erstellt_von',   type: 'TEXT',      desc: 'user_id des Erstellers' },
                { name: 'is_locked',      type: 'BOOLEAN',   desc: 'Gesperrt für Bearbeitung' },
              ]}
            />

            <Arrow label="1 : n" />

            {/* szenen */}
            <TableCard
              title="szenen"
              color={C.green}
              note="Eine einzelne Szene innerhalb einer Fassung"
              fields={[
                { name: 'id',            type: 'SERIAL PK', desc: 'Interne ID' },
                { name: 'stage_id',      type: 'INT FK',    desc: 'Fassung' },
                { name: 'scene_nummer',  type: 'INT',       desc: 'Szenennummer (im Kopf: Nummer)' },
                { name: 'int_ext',       type: 'TEXT',      desc: "INT | EXT | INT/EXT (im Kopf: Int/Ext)" },
                { name: 'tageszeit',     type: 'TEXT',      desc: "TAG | NACHT | ABEND | DÄMMERUNG (Tag/Nacht)" },
                { name: 'ort_name',      type: 'TEXT',      desc: 'Motivname, z.B. Gartenhaus / Küche' },
                { name: 'zusammenfassung',type: 'TEXT',     desc: 'Kurzbeschreibung (Beschreibungs-Zeile)' },
                { name: 'content',       type: 'JSONB []',  desc: 'Szenentext als Block-Array — siehe Abschnitt 3' },
                { name: 'dauer_min',     type: 'INT',       desc: 'Spieldauer in Minuten (Integer)' },
                { name: 'sort_order',    type: 'INT',       desc: 'Reihenfolge innerhalb der Fassung' },
                { name: 'meta_json',     type: 'JSONB',     desc: 'Erweiterungsfelder — siehe Abschnitt 2' },
              ]}
            />
          </div>
        </Section>

        {/* ── 2. Szenenkopf-Mapping ── */}
        <Section title="2. Szenenkopf — Feld-Mapping">
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
            Nicht alle Felder aus dem Szenenkopf haben eigene Datenbankspalten. Felder in <code>meta_json</code> sind
            flexibel, aber nicht indexierbar. Eine spätere Migration kann sie zu eigenen Spalten promoten.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: C.subtle }}>
                <th style={{ textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}` }}>Szenenkopf-Feld</th>
                <th style={{ textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}` }}>Tabelle</th>
                <th style={{ textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}` }}>DB-Feldname</th>
                <th style={{ textAlign: 'left', padding: '7px 10px', border: `1px solid ${C.border}` }}>Typ</th>
                <th style={{ textAlign: 'center', padding: '7px 10px', border: `1px solid ${C.border}`, width: 60 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { field: 'Nummer',       table: 'szenen', col: 'scene_nummer',            type: 'INT',     ok: true,  note: '' },
                { field: 'Int/Ext',      table: 'szenen', col: 'int_ext',                 type: 'TEXT',    ok: true,  note: '' },
                { field: 'Motiv',        table: 'szenen', col: 'ort_name',                type: 'TEXT',    ok: true,  note: '' },
                { field: 'Tag/Nacht',    table: 'szenen', col: 'tageszeit',               type: 'TEXT',    ok: true,  note: '' },
                { field: 'Beschreibung', table: 'szenen', col: 'zusammenfassung',         type: 'TEXT',    ok: true,  note: '' },
                { field: 'Episode',      table: 'stages', col: 'folge_nummer',            type: 'INT',     ok: true,  note: 'liegt auf Stage, wird in Szene aus Kontext gefüllt' },
                { field: 'Block',        table: 'stages', col: 'proddb_block_id',         type: 'UUID',    ok: true,  note: 'kommt aus Produktionsdatenbank' },
                { field: 'Seiten',       table: 'szenen', col: "meta_json->>'seiten'",    type: 'TEXT',    ok: false, note: 'z.B. "2 5/8" — dauer_min ist ungeeignet (INT)' },
                { field: 'Spieltag',     table: 'szenen', col: "meta_json->>'spieltag'",  type: 'INT',     ok: false, note: 'Drehtag-Index' },
                { field: 'Storyline',    table: 'szenen', col: "meta_json->>'storyline'", type: 'TEXT',    ok: false, note: '' },
                { field: 'Stimmung',     table: 'szenen', col: "meta_json->>'stimmung'",  type: 'TEXT',    ok: false, note: '' },
                { field: 'Casttyp',      table: 'szenen', col: "meta_json->>'casttyp'",   type: 'TEXT',    ok: false, note: '' },
                { field: 'Rollen',       table: 'entities', col: 'entity_type=charakter', type: 'JOIN',   ok: false, note: 'Szene↔Entity-Verknüpfungstabelle fehlt noch' },
                { field: 'Komparsen',    table: 'entities', col: 'entity_type=komparsen', type: 'JOIN',   ok: false, note: 'entity_type "komparsen" noch nicht definiert' },
              ].map(r => (
                <tr key={r.field}>
                  <td style={{ padding: '6px 10px', border: `1px solid ${C.border}`, fontWeight: 600 }}>{r.field}</td>
                  <td style={{ padding: '6px 10px', border: `1px solid ${C.border}` }}>
                    <Badge color={r.table === 'szenen' ? C.green : r.table === 'stages' ? C.orange : C.purple}>
                      {r.table}
                    </Badge>
                  </td>
                  <td style={{ padding: '6px 10px', border: `1px solid ${C.border}` }}>
                    <code style={{ fontSize: 11 }}>{r.col}</code>
                  </td>
                  <td style={{ padding: '6px 10px', border: `1px solid ${C.border}`, color: C.muted, fontFamily: 'monospace', fontSize: 11 }}>{r.type}</td>
                  <td style={{ padding: '6px 10px', border: `1px solid ${C.border}`, textAlign: 'center' }}>
                    {r.ok
                      ? <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>✓</span>
                      : <span title={r.note} style={{ color: C.orange, fontSize: 13, fontWeight: 700, cursor: 'help' }}>⚠</span>
                    }
                    {r.note && !r.ok && <div style={{ fontSize: 10, color: C.muted, marginTop: 2, maxWidth: 220 }}>{r.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
            <strong>✓</strong> eigene Spalte &nbsp;·&nbsp;
            <strong>⚠</strong> in <code>meta_json</code> oder fehlt noch — geplant für spätere Migration
          </p>
        </Section>

        {/* ── 3. Fassungen ── */}
        <Section title="3. Fassungen (Stages)">
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
            Eine Folge kann mehrere Fassungen gleichzeitig haben (z.B. Treatment und Drehbuch in Bearbeitung).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { type: 'expose',    label: 'Exposé',      color: C.gray,   desc: 'Erste Ideenskizze, kurz' },
              { type: 'treatment', label: 'Treatment',   color: C.blue,   desc: 'Ausgearbeitete Handlung (konfigurierbar: Storylines / Outline)' },
              { type: 'draft',     label: 'Drehbuch',    color: C.orange, desc: 'Szenen mit Dialog (Arbeitsfassung → Drehfassung → …)' },
              { type: 'final',     label: 'Endfassung',  color: C.green,  desc: 'Freigegebene Produktionsfassung' },
            ].map(s => (
              <div key={s.type} style={{
                border: `1px solid ${s.color}`,
                borderRadius: 8,
                padding: 12,
                background: s.color + '0d',
              }}>
                <div style={{ fontWeight: 700, color: s.color, fontSize: 12, marginBottom: 4 }}>
                  stage_type = <code>'{s.type}'</code>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{s.desc}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, fontSize: 12 }}>
            <strong>Status-Werte</strong> (<code>stages.status</code>):
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { v: 'in_arbeit',   label: 'In Bearbeitung', color: C.blue },
                { v: 'review',      label: 'In Review',      color: C.orange },
                { v: 'freigegeben', label: 'Freigegeben',    color: C.green },
                { v: 'archiviert',  label: 'Archiviert',     color: C.gray },
              ].map(s => (
                <span key={s.v} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  border: `1px solid ${s.color}`,
                  borderRadius: 6, padding: '4px 10px',
                  fontSize: 11,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
                  <code style={{ color: s.color }}>{s.v}</code>
                  <span style={{ color: C.muted }}>→ {s.label}</span>
                </span>
              ))}
            </div>
            <p style={{ marginTop: 12, color: C.orange, fontSize: 11 }}>
              <strong>Fehlt noch:</strong> Farb-Markierung der Fassung (z.B. "Gelb") — geplant als <code>stages.meta_json-&gt;&gt;'farbe'</code>
            </p>
          </div>
        </Section>

        {/* ── 4. content JSONB ── */}
        <Section title="4. Szenentext — content JSONB">
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
            <code>szenen.content</code> ist ein Array von Blöcken. Jeder Block hat mindestens <code>type</code> und <code>text</code>.
          </p>
          <div style={{ background: C.subtle, borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.7, overflowX: 'auto' }}>
            <pre style={{ margin: 0 }}>{`[
  { "type": "heading",  "text": "INT. GARTENHAUS / KÜCHE – TAG" },
  { "type": "action",   "text": "Lou und Jess sind überrascht, als Daniel…" },
  { "type": "dialog",   "speaker": "LOU",  "text": "Das kann nicht sein." },
  { "type": "dialog",   "speaker": "JESS", "text": "Doch. Glaub mir." },
  { "type": "parenthetical", "text": "(leise)" },
  { "type": "transition", "text": "SCHNITT AUF:" }
]`}</pre>
          </div>
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 12 }}>Block-Typen:</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {['heading', 'action', 'dialog', 'parenthetical', 'transition'].map(t => (
                <Badge key={t} color={C.blue}>{t}</Badge>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <strong style={{ fontSize: 12 }}>Versionshistorie:</strong>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              Bei jedem Speichern wird ein Snapshot in <code>szenen_versionen.content_snapshot</code> geschrieben.
              Felder: <code>szene_id</code> · <code>user_id</code> · <code>user_name</code> · <code>content_snapshot</code> · <code>change_summary</code> · <code>created_at</code>
            </div>
          </div>
        </Section>

        {/* ── 5. Entities ── */}
        <Section title="5. Entities (Charaktere, Motive, Props …)">
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
            Wiederverwendbare Objekte einer Staffel — aktuell staffelweit, nicht pro Szene verknüpft.
          </p>
          <TableCard
            title="entities"
            color={C.purple}
            note="Staffelweite Entitäten für Breakdown"
            fields={[
              { name: 'id',          type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'entity_type', type: 'TEXT',      desc: "charakter | prop | location | kostuem | fahrzeug" },
              { name: 'name',        type: 'TEXT',      desc: 'Anzeigename' },
              { name: 'external_id', type: 'TEXT',      desc: 'ID in externer App (z.B. Vertragsdatenbank)' },
              { name: 'external_app',type: 'TEXT',      desc: 'Quell-App (z.B. vertraege)' },
              { name: 'staffel_id',  type: 'TEXT FK',   desc: 'Staffel' },
              { name: 'meta_json',   type: 'JSONB',     desc: 'Beliebige Metadaten' },
            ]}
          />
          <p style={{ fontSize: 11, color: C.orange, marginTop: 10 }}>
            <strong>Fehlt noch:</strong> Verknüpfungstabelle <code>szene_entities (szene_id, entity_id, rolle)</code> —
            ohne diese können Rollen/Komparsen nicht pro Szene gespeichert werden.
            Geplant: entity_type <code>'komparsen'</code> ergänzen.
          </p>
        </Section>

        {/* ── 6. Locking ── */}
        <Section title="6. Locking & Kommentare">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <TableCard
              title="episode_locks"
              color={C.red}
              note="Sperrt eine Folge (alle Stages) für Bearbeitung"
              fields={[
                { name: 'staffel_id',   type: 'TEXT FK', desc: 'Staffel' },
                { name: 'folge_nummer', type: 'INT',     desc: 'Gesperrte Folge' },
                { name: 'locked_by',    type: 'TEXT',    desc: 'user_id' },
                { name: 'reason',       type: 'TEXT',    desc: 'Grund der Sperre' },
                { name: 'locked_at',    type: 'TSTZ',    desc: 'Zeitpunkt' },
              ]}
            />
            <TableCard
              title="kommentare"
              color={C.gray}
              note="Inline-Kommentare zu einer Szene"
              fields={[
                { name: 'szene_id',    type: 'INT FK', desc: 'Szene' },
                { name: 'user_id',     type: 'TEXT',   desc: 'Autor' },
                { name: 'text',        type: 'TEXT',   desc: 'Kommentartext' },
                { name: 'line_ref',    type: 'TEXT',   desc: 'Block-Referenz im content-Array' },
                { name: 'resolved',    type: 'BOOL',   desc: 'Erledigt-Flag' },
                { name: 'resolved_by', type: 'TEXT',   desc: 'Wer hat erledigt' },
              ]}
            />
          </div>
        </Section>

        {/* ── 7. Externe Verknüpfungen ── */}
        <Section title="7. Externe Verknüpfungen">
          <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                from: 'staffeln.produktion_db_id',
                to: 'Produktionsdatenbank · productions.id (UUID)',
                desc: 'Verknüpft die Staffel mit der Produktionsdatenbank für Block/Folgen-Daten',
                color: C.blue,
              },
              {
                from: 'stages.proddb_block_id',
                to: 'Produktionsdatenbank · blocks.id (UUID)',
                desc: 'Direkter Block-Bezug ohne lokale Sync-Tabellen (ab v10)',
                color: C.orange,
              },
              {
                from: 'entities.external_id + external_app',
                to: 'z.B. Vertragsdatenbank · personen.id',
                desc: 'Charakter in Vertragsdatenbank als externe Referenz',
                color: C.purple,
              },
              {
                from: 'kommentare → messenger.app',
                to: 'geplant: messenger.app Annotations',
                desc: 'Inline-Kommentare könnten künftig als messenger.app Annotations gespeichert werden',
                color: C.gray,
              },
            ].map(r => (
              <div key={r.from} style={{
                border: `1px solid ${r.color}44`,
                borderLeft: `3px solid ${r.color}`,
                borderRadius: 6,
                padding: '8px 12px',
                background: r.color + '08',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <code style={{ fontSize: 11, color: r.color }}>{r.from}</code>
                  <span style={{ color: C.muted, fontSize: 12 }}>→</span>
                  <code style={{ fontSize: 11, color: C.muted }}>{r.to}</code>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{r.desc}</div>
              </div>
            ))}
          </div>
        </Section>
          </div>
        )}

      </div>
    </AppShell>
  )
}

export default HilfePage
