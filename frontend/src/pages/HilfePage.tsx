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

function DokumentEditorHilfeTab() {
  return (
    <div style={{ padding: '28px 0' }}>

      <Section title="1. Dokument-System (Folgen-Dokumente)">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Jede Folge kann mehrere <strong>Dokument-Typen</strong> haben: Drehbuch, Storyline, Notiz, Abstrakt sowie
            admin-definierte Custom-Typen. Jeder Typ hat exakt ein Dokument pro Folge.
          </p>
          <p style={{ marginBottom: 8 }}>
            <strong>Fassungen</strong> sind Versionen desselben Dokuments (Fassung 1, 2, 3...).
            Beim Erstellen einer neuen Fassung wird der Inhalt der aktuellen Fassung kopiert.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            {[
              { label: 'Drehbuch', color: C.blue, note: 'Drehbuch-Format (Final Draft)' },
              { label: 'Storyline', color: C.orange, note: 'Rich Text' },
              { label: 'Notiz', color: C.gray, note: 'Rich Text' },
              { label: 'Custom-Typ', color: C.purple, note: 'Admin-konfigurierbar' },
            ].map(t => (
              <div key={t.label} style={{ border: `1px solid ${t.color}44`, borderLeft: `3px solid ${t.color}`, borderRadius: 6, padding: '6px 12px', background: t.color + '08', fontSize: 11 }}>
                <strong style={{ color: t.color }}>{t.label}</strong>
                <div style={{ color: C.muted, marginTop: 2 }}>{t.note}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="2. Sichtbarkeits-States">
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <p style={{ color: C.muted, marginBottom: 12 }}>
            Jede Fassung hat einen Sichtbarkeits-Status, der bestimmt wer lesen und schreiben darf.
          </p>
          {[
            { status: 'privat',     color: '#757575', desc: 'Nur der Ersteller. Andere sehen das Dokument nicht.' },
            { status: 'colab',      color: '#007AFF', desc: 'Nur Mitglieder der Colab-Gruppe koennen schreiben. Echtzeit-Kollaboration aktiv.' },
            { status: 'review',     color: '#FF9500', desc: 'Reviewer koennen lesen und annotieren, nicht schreiben.' },
            { status: 'produktion', color: '#AF52DE', desc: 'Produktions-Gruppe sieht das Dokument (nur lesen).' },
            { status: 'alle',       color: '#00C853', desc: 'Alle eingeloggten Nutzer koennen lesen.' },
          ].map(s => (
            <div key={s.status} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
              <span style={{ padding: '2px 8px', borderRadius: 99, border: `1px solid ${s.color}`, color: s.color, fontSize: 11, fontWeight: 500, flexShrink: 0, marginTop: 1 }}>{s.status}</span>
              <span style={{ color: C.muted }}>{s.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="3. Abgabe-Flow">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 12 }}>Die Schaltflaeche Abgeben friert die aktuelle Fassung ein und erstellt optional die naechste.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {['Fassung 1 aktiv', 'Abgeben', 'F1 eingefroren', 'Fassung 2 erstellt'].map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {i > 0 && <span style={{ color: C.muted }}>dann</span>}
                <span style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border)', fontSize: 11 }}>{s}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 12 }}>Eingefrorene Fassungen sind schreibgeschuetzt (HTTP 409 bei Schreibversuch).</p>
        </div>
      </Section>

      <Section title="4. Drehbuch-Editor (Screenplay-Format)">
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <p style={{ color: C.muted, marginBottom: 12 }}>
            Tiptap/ProseMirror-basierter WYSIWYG-Editor. 7 Elementtypen, Tab/Enter-Flow nach Final Draft Standard.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Element', 'Tab-Folge', 'Enter-Folge', 'Einrueckung L/R'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: C.muted, fontWeight: 500 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[
                { typ: 'scene_heading', tab: 'action', enter: 'action', lr: '0 / 0' },
                { typ: 'action', tab: 'character', enter: 'action', lr: '0 / 0' },
                { typ: 'character', tab: 'action', enter: 'dialogue', lr: '37 / 0' },
                { typ: 'dialogue', tab: 'character', enter: 'character', lr: '25 / 25' },
                { typ: 'parenthetical', tab: 'dialogue', enter: 'dialogue', lr: '30 / 30' },
                { typ: 'transition', tab: 'scene_heading', enter: 'scene_heading', lr: '0 / 0' },
                { typ: 'shot', tab: 'action', enter: 'action', lr: '0 / 0' },
              ].map(e => (
                <tr key={e.typ} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 500, color: C.blue }}>{e.typ}</td>
                  <td style={{ padding: '4px 8px', color: C.muted }}>{e.tab}</td>
                  <td style={{ padding: '4px 8px', color: C.muted }}>{e.enter}</td>
                  <td style={{ padding: '4px 8px', color: C.muted }}>{e.lr} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="5. Echtzeit-Kollaboration">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Kollaboration ist aktiv wenn die Fassung auf colab gesetzt ist und der Nutzer Autor-Rolle hat.
            Technologie: Yjs + Hocuspocus WebSocket (/ws/collab).
          </p>
          <p>
            Im Online-Modus werden Aenderungen in Echtzeit synchronisiert. Im Offline-Modus erscheint ein roter Warnhinweis.
            Aenderungen werden bei Reconnect automatisch zusammengefuehrt.
          </p>
        </div>
      </Section>

      <Section title="6. Side-by-Side Ansicht">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p>
            Ueber den Columns-Button in der Topbar koennen zwei Panels nebeneinander angezeigt werden.
            Jedes Panel hat einen eigenen Dokumenttyp- und Fassungs-Selektor.
            Typische Kombination: Storyline links, Drehbuch rechts.
          </p>
        </div>
      </Section>

    </div>
  )
}


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

// ── Kommentare Tab ────────────────────────────────────────────────────────────

function KommentareTab() {
  const steps = [
    { num: 1, title: 'Badge erscheint in der Szenenleiste', text: 'Sobald jemand im Messenger-App einen Kommentar zu einer Szene erstellt, erscheint in der Szenenleiste ein gelbes Sprechblasen-Symbol mit der Anzahl ungelesener Kommentare.' },
    { num: 2, title: 'Szene auswählen', text: 'Klicke auf die Szene in der Szenenleiste. Die Szene öffnet sich im Editor.' },
    { num: 3, title: 'Kommentare als gelesen markieren', text: 'Klicke im Szenen-Header auf den Kommentare-Button (Sprechblasen-Icon mit Zahl). Das Badge verschwindet sofort und die Kommentare gelten als gelesen.' },
    { num: 4, title: 'Kommentare im Messenger lesen', text: 'Öffne messenger.serienwerft.studio und suche nach der Szene — oder folge dem Link "In Script-App öffnen" in der Messenger-App zurück zu dieser Szene.' },
  ]

  const facts = [
    { label: 'Aktualisierung', value: 'Alle 60 Sekunden automatisch' },
    { label: 'Gelesen-Status', value: 'Nur beim expliziten Klick auf den Kommentare-Button' },
    { label: 'Kommentare schreiben', value: 'Ausschließlich im Messenger-App' },
    { label: 'Datenschutz', value: 'Script-App speichert nur Zeitstempel (wann du zuletzt gelesen hast) — keine Inhalte' },
    { label: 'Cross-Device', value: 'Read-Status ist pro User gespeichert und gilt auf allen Geräten' },
  ]

  return (
    <div style={{ padding: '28px 0' }}>
      <Section title="Kommentare & Messenger">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          Kommentare zu Szenen werden im <strong>Messenger-App</strong> verwaltet und erscheinen in der Script-App
          als Badge in der Szenenleiste. Die Script-App zeigt nur an, ob es ungelesene Kommentare gibt —
          Verfassen und Verwalten erfolgt ausschließlich im Messenger-App.
        </p>

        {/* Wie-es-funktioniert */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, color: C.text }}>So funktioniert es</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {steps.map(s => (
              <div key={s.num} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: C.blue,
                  color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {s.num}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{s.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Badge-Legende */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>Das Badge verstehen</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { color: '#FFCC00', label: 'Gelbes Badge mit Zahl', desc: 'Es gibt ungelesene Kommentare — Anzahl wird angezeigt' },
              { color: C.muted, label: 'Kein Badge', desc: 'Keine Kommentare zu dieser Szene, oder alle wurden gelesen' },
            ].map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.subtle }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>💬</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: b.color, minWidth: 16 }}>3</span>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{b.label}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{b.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation Messenger → Script */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>Von Messenger zur Script-App navigieren</h3>
          <div style={{ padding: '14px 16px', background: C.blue + '10', border: `1px solid ${C.blue}33`, borderRadius: 8, fontSize: 12, lineHeight: 1.7, color: C.text }}>
            Wenn du im Messenger-App eine Annotation zu einer Szene siehst, erscheint im Kommentar-Panel
            oben rechts der Link <strong>"In Script-App öffnen"</strong>. Dieser Link öffnet die Script-App
            direkt bei der richtigen Szene und Folge.
          </div>
        </div>

        {/* Technische Details */}
        <div>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: C.text }}>Technische Details</h3>
          <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 0, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {facts.map((f, i) => (
              <div key={f.label} style={{
                display: 'grid', gridTemplateColumns: '200px 1fr',
                borderBottom: i < facts.length - 1 ? `1px solid ${C.border}` : undefined,
                fontSize: 12,
              }}>
                <div style={{ padding: '8px 12px', fontWeight: 600, background: C.subtle, color: C.muted }}>{f.label}</div>
                <div style={{ padding: '8px 12px' }}>{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </div>
  )
}

// ── Helper: Verbindungslinie (horizontal + vertikal) ───────────────────────
function Connector({ direction = 'down', label, color = C.muted }: { direction?: 'down' | 'right' | 'left-right'; label?: string; color?: string }) {
  if (direction === 'right') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', color }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>→</span>
        {label && <span style={{ fontSize: 10 }}>{label}</span>}
      </div>
    )
  }
  if (direction === 'left-right') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', color }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>↔</span>
        {label && <span style={{ fontSize: 10 }}>{label}</span>}
      </div>
    )
  }
  return <Arrow label={label} />
}

// ── Kleine Inline-Box ──────────────────────────────────────────────────────
function FieldBox({ name, type, pk, fk, nullable, deprecated }: {
  name: string; type: string; pk?: boolean; fk?: boolean; nullable?: boolean; deprecated?: boolean
}) {
  return (
    <div style={{
      display: 'flex', gap: 6, alignItems: 'baseline', padding: '3px 0',
      opacity: deprecated ? 0.5 : 1,
    }}>
      <code style={{ fontSize: 11, fontWeight: pk ? 700 : 500, color: pk ? C.blue : fk ? C.purple : C.text }}>
        {name}
      </code>
      <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.muted, textTransform: 'uppercase' }}>{type}</span>
      {pk && <Badge color={C.blue}>PK</Badge>}
      {fk && <Badge color={C.purple}>FK</Badge>}
      {nullable && <span style={{ fontSize: 9, color: C.orange }}>NULL</span>}
      {deprecated && <Badge color={C.red}>DEPRECATED</Badge>}
    </div>
  )
}

// ── Warn-Box ───────────────────────────────────────────────────────────────
function WarnBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      border: `1px solid ${C.orange}55`,
      borderLeft: `4px solid ${C.orange}`,
      borderRadius: 8,
      padding: '12px 16px',
      background: C.orange + '0a',
      marginTop: 12,
      marginBottom: 12,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: C.orange, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

// ── Info-Box ───────────────────────────────────────────────────────────────
function InfoBox({ title, children, color = C.blue }: { title: string; children: React.ReactNode; color?: string }) {
  return (
    <div style={{
      border: `1px solid ${color}33`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 8,
      padding: '12px 16px',
      background: color + '08',
      marginTop: 12,
      marginBottom: 12,
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{children}</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Szenen & Werkstufen Tab (Werkstufen-Modell v2, revidiert 2026-05-02)
// ══════════════════════════════════════════════════════════════════════════════
function SzenenFassungenTab() {
  return (
    <div style={{ padding: '28px 0' }}>

      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.purple}15 0%, ${C.blue}10 50%, ${C.green}10 100%)`,
        border: `1px solid ${C.purple}33`,
        borderRadius: 12,
        padding: '24px 28px',
        marginBottom: 36,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Werkstufen-Modell (v2)</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          5 Kerntabellen: <code>staffeln</code> → <code>folgen</code> → <code>scene_identities</code> +{' '}
          <code>werkstufen</code> → <code>dokument_szenen</code>. Content lebt ausschliesslich in{' '}
          <code>dokument_szenen.content</code> — kein separates <code>inhalt</code>-Feld.
          Die <strong>Scene Identity</strong> (UUID) bleibt stabil ueber alle Werkstufen hinweg,
          auch wenn Szenennummer, Position oder Motiv sich aendern.
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Scene Identity', desc: 'Stabile UUID pro Szene', color: C.blue },
            { label: 'Werkstufe', desc: 'Storyline V1, Drehbuch V2...', color: C.orange },
            { label: 'Dokument-Szene', desc: 'Content + Header (N:M)', color: C.green },
            { label: 'Soft-Delete', desc: 'geloescht=true fuer Diff', color: C.purple },
          ].map(b => (
            <div key={b.label} style={{
              flex: '1 1 160px',
              border: `1px solid ${b.color}33`,
              borderRadius: 8,
              padding: '10px 14px',
              background: b.color + '0a',
            }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: b.color }}>{b.label}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{b.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 1. ER-Diagramm — Werkstufen-Modell */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="1. Datenmodell — ER-Uebersicht (5 Kerntabellen)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          Die Hierarchie: <strong>Staffel → Folge → Scene Identity + Werkstufe → Dokument-Szene</strong>.{' '}
          <code>dokument_szenen</code> ist die N:M-Kreuzungstabelle zwischen Szenen und Werkstufen.
        </p>

        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
          overflowX: 'auto',
        }}>
          {/* Top row: staffeln → folgen */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 180, flexShrink: 0 }}>
              <TableCard title="staffeln" color={C.blue}
                note="Produktion (z.B. Rote Rosen)"
                fields={[
                  { name: 'id', type: 'TEXT', desc: 'Slug (PK)' },
                  { name: 'titel', type: 'TEXT', desc: 'Anzeigename' },
                  { name: 'produktion_db_id', type: 'UUID', desc: 'Ext. Produktions-DB' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center', flexShrink: 0 }}>
              <Connector direction="right" label="1 : n" />
            </div>

            <div style={{ minWidth: 280, flexShrink: 0 }}>
              <TableCard title="folgen" color={C.purple}
                note="Eine Episode (merged aus folgen_dokumente + folgen_meta)"
                fields={[
                  { name: 'id', type: 'SERIAL', desc: 'PK' },
                  { name: 'staffel_id', type: 'TEXT FK', desc: '→ staffeln.id' },
                  { name: 'folge_nummer', type: 'INT', desc: 'Episodennummer' },
                  { name: 'folgen_titel', type: 'TEXT', desc: 'Episodentitel' },
                  { name: 'produktion_db_id', type: 'UUID', desc: 'Ext. Folgen-UUID (nullable)' },
                  { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
                  { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
                ]}
              />
            </div>
          </div>

          {/* Arrows down from folgen */}
          <div style={{ display: 'flex', gap: 16, marginLeft: 230 }}>
            <div style={{ width: 200 }}><Arrow label="1 : n" /></div>
            <div style={{ width: 200 }}><Arrow label="1 : n" /></div>
          </div>

          {/* Middle row: scene_identities + werkstufen */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 220, flexShrink: 0 }}>
              <TableCard title="scene_identities" color={C.blue}
                note="Stabile UUID — existiert ueber alle Werkstufen"
                fields={[
                  { name: 'id', type: 'UUID', desc: 'PK (global stabil!)' },
                  { name: 'folge_id', type: 'INT FK', desc: '→ folgen.id' },
                  { name: 'created_by', type: 'TEXT', desc: 'Ersteller' },
                  { name: 'created_at', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
                ]}
              />
            </div>

            <div style={{ minWidth: 300, flexShrink: 0 }}>
              <TableCard title="werkstufen" color={C.orange}
                note="Version auf Folgen-Ebene (ersetzt fassungen)"
                fields={[
                  { name: 'id', type: 'UUID', desc: 'PK' },
                  { name: 'folge_id', type: 'INT FK', desc: '→ folgen.id' },
                  { name: 'typ', type: 'TEXT', desc: 'storyline | drehbuch | treatment | notiz' },
                  { name: 'version_nummer', type: 'INT', desc: 'Version (1, 2, 3...)' },
                  { name: 'label', type: 'TEXT', desc: 'z.B. "Blau", "Drehfassung"' },
                  { name: 'sichtbarkeit', type: 'TEXT', desc: 'team | privat | colab | review | alle' },
                  { name: 'abgegeben', type: 'BOOL', desc: 'Eingefroren?' },
                  { name: 'bearbeitung_status', type: 'TEXT', desc: 'entwurf | in_arbeit | abgeschlossen' },
                  { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
                  { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
                ]}
              />
            </div>
          </div>

          {/* Arrows converging to dokument_szenen */}
          <div style={{ display: 'flex', gap: 16, marginLeft: 80 }}>
            <div style={{ width: 200 }}><Arrow label="N : 1" /></div>
            <div style={{ width: 200 }}><Arrow label="N : 1" /></div>
          </div>

          {/* Bottom: dokument_szenen (Kreuzungstabelle) */}
          <div style={{ maxWidth: 540 }}>
            <TableCard title="dokument_szenen" color={C.green}
              note="Kreuzungstabelle: Content + Header pro Szene pro Werkstufe"
              fields={[
                { name: 'id', type: 'UUID', desc: 'PK' },
                { name: 'scene_identity_id', type: 'UUID FK', desc: '→ scene_identities.id' },
                { name: 'werkstufe_id', type: 'UUID FK', desc: '→ werkstufen.id' },
                { name: 'format', type: 'TEXT', desc: 'drehbuch | storyline | notiz (bestimmt Editor)' },
                { name: 'scene_nummer', type: 'INT', desc: 'Angezeigte Szenennummer' },
                { name: 'sort_order', type: 'INT', desc: 'Reihenfolge in dieser Werkstufe' },
                { name: 'ort_name', type: 'TEXT', desc: 'Motivname (z.B. Kueche)' },
                { name: 'int_ext', type: 'TEXT', desc: 'INT | EXT | INT/EXT' },
                { name: 'tageszeit', type: 'TEXT', desc: 'TAG | NACHT | ABEND | ...' },
                { name: 'zusammenfassung', type: 'TEXT', desc: 'Kurzbeschreibung' },
                { name: 'content', type: 'JSONB', desc: 'Szenentext (einzige Content-Quelle!)' },
                { name: 'stoppzeit_sek', type: 'INT', desc: 'Spieldauer in Sekunden (Frontend: mm:ss)' },
                { name: 'spieltag', type: 'INT', desc: 'Drehtag-Index' },
                { name: 'stimmung', type: 'TEXT', desc: 'Stimmung der Szene' },
                { name: 'szeneninfo', type: 'TEXT', desc: 'Notizen / Logging' },
                { name: 'geloescht', type: 'BOOL', desc: 'Soft-Delete (bleibt fuer Diff)' },
                { name: 'is_wechselschnitt', type: 'BOOL', desc: 'Wechselschnitt-Szene' },
                { name: 'bearbeitet_von', type: 'TEXT', desc: 'Wer hat zuletzt geaendert' },
                { name: 'bearbeitet_am', type: 'TSTZ', desc: 'Letzte Aenderung' },
              ]}
            />
          </div>

          {/* UNIQUE Constraint Hinweis */}
          <div style={{
            marginTop: 16,
            padding: '10px 16px',
            background: C.blue + '0a',
            border: `1px dashed ${C.blue}44`,
            borderRadius: 8,
            fontSize: 11,
            color: C.muted,
          }}>
            <strong>UNIQUE(scene_identity_id, werkstufe_id)</strong> — Pro Szene und Werkstufe genau ein Eintrag.
            Eine Szene existiert in mehreren Werkstufen (N:M-Beziehung aufgeloest durch dokument_szenen).
          </div>
        </div>

        <InfoBox title="Kernprinzip: Scene Identity" color={C.blue}>
          Eine <code>scene_identity</code> ist die <strong>unveraenderliche Seele</strong> einer Szene.
          Szenennummern, Positionen, Motive — alles kann sich zwischen Werkstufen aendern. Die UUID bleibt.
          Damit sind Characters, Vorstopp, Kommentare und Revisionen stabil verknuepft.
          <div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 8, padding: 8, background: C.subtle, borderRadius: 6 }}>
            Szene abc-123: Storyline V1 → Nr.5 Cafe | Drehbuch V1 → Nr.8 Restaurant | Drehbuch V2 → Nr.3 Restaurant
          </div>
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 2. Werkstufe vs. Fassung — was hat sich geaendert */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="2. Werkstufe (ersetzt Fassung)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Eine <strong>Werkstufe</strong> definiert Typ + Version auf Folgen-Ebene.
          Status-Felder gelten fuer <strong>alle</strong> dokument_szenen dieser Werkstufe.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Alt */}
          <div style={{
            border: `2px dashed ${C.red}44`,
            borderRadius: 10,
            padding: 16,
            background: C.red + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.red, marginBottom: 12 }}>
              Altes Modell (wird ersetzt)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
              <FieldBox name="folgen_dokumente" type="Typ pro Folge" deprecated />
              <FieldBox name="folgen_dokument_fassungen" type="Version + inhalt JSONB" deprecated />
              <FieldBox name="fassungen.inhalt" type="Ganzes Dokument als Blob" deprecated />
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
              Problem: Content doppelt (inhalt + dokument_szenen.content)
            </div>
          </div>

          {/* Neu */}
          <div style={{
            border: `2px solid ${C.green}`,
            borderRadius: 10,
            padding: 16,
            background: C.green + '08',
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.green, marginBottom: 12 }}>
              Neues Modell (Werkstufen)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
              <FieldBox name="folgen" type="Merged: 1 Tabelle pro Episode" />
              <FieldBox name="werkstufen" type="Typ + Version + Status" />
              <FieldBox name="dokument_szenen.content" type="Einzige Content-Quelle" />
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
              Kein inhalt-Blob, keine Redundanz
            </div>
          </div>
        </div>

        {/* Neue Werkstufe Flow */}
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Neue Werkstufe erstellen (Flow)</div>
          <div style={{ padding: '16px 20px', fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {[
                'Neue Werkstufe anlegen (typ, version)',
                'Alle dokument_szenen kopieren (geloescht=false)',
                'Gleiche scene_identity_ids beibehalten',
                'Neue UUIDs fuer dokument_szenen',
                'Alle scene_identities der Folge verknuepft',
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {i > 0 && <span style={{ color: C.muted, fontSize: 16 }}>→</span>}
                  <span style={{
                    padding: '4px 10px', borderRadius: 6,
                    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
                    fontSize: 11,
                  }}>{`${i + 1}. ${s}`}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 3. Format & Stoppzeit */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="3. Format, Stoppzeit & Soft-Delete">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

          <div style={{
            border: `1px solid ${C.blue}33`,
            borderRadius: 10, padding: 16, background: C.blue + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 8 }}>Format (Editor-Typ)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <code>dokument_szenen.format</code> bestimmt den Editor:
              <ul style={{ margin: '8px 0', paddingLeft: 16 }}>
                <li><code>drehbuch</code> → Screenplay-Editor (7 Elementtypen)</li>
                <li><code>storyline</code> → Rich-Text-Editor</li>
                <li><code>notiz</code> → Leichtgewichtiger Editor</li>
              </ul>
              Normalerweise = <code>werkstufe.typ</code>, aber Ausnahmen moeglich
              (z.B. Notiz-Seite innerhalb eines Drehbuchs).
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.green}33`,
            borderRadius: 10, padding: 16, background: C.green + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 8 }}>Stoppzeit</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <code>stoppzeit_sek INT</code> — Sekunden, kein String.
              <div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 8, padding: 6, background: C.subtle, borderRadius: 4 }}>
                270 → "04:30" (Frontend-Formatierung)<br />
                Gesamt = SUM(stoppzeit_sek)<br />
                WHERE werkstufe_id=X<br />
                AND geloescht=false
              </div>
              <div style={{ marginTop: 8 }}>
                Ersetzt die alten Felder <code>dauer_min</code> + <code>dauer_sek</code>.
              </div>
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.purple}33`,
            borderRadius: 10, padding: 16, background: C.purple + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.purple, marginBottom: 8 }}>Soft-Delete</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <code>geloescht BOOLEAN</code> — kein echtes Loeschen.
              <ul style={{ margin: '8px 0', paddingLeft: 16 }}>
                <li>Im Editor/Navigator: ausgeblendet</li>
                <li>Neue Werkstufe: nicht mitkopiert</li>
                <li>Diff-Ansicht: sichtbar als "gestrichen"</li>
                <li>DB: Datensatz bleibt erhalten</li>
              </ul>
            </div>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 4. Verknuepfte Tabellen */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="4. Verknuepfte Tabellen (Characters, Vorstopp, Revision)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Characters und Vorstopp haengen an <code>scene_identity_id</code> (werkstufenuebergreifend stabil).
          Revisionen haengen an <code>dokument_szene_id</code> (pro Werkstufe-Auspraegung).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <TableCard title="scene_characters" color={C.orange}
            note="Welche Charaktere spielen in dieser Szene?"
            fields={[
              { name: 'id', type: 'SERIAL', desc: 'PK' },
              { name: 'scene_identity_id', type: 'UUID FK', desc: '→ scene_identities.id (stabil!)' },
              { name: 'character_id', type: 'UUID FK', desc: '→ characters.id' },
              { name: 'kategorie_id', type: 'INT FK', desc: '→ character_kategorien.id' },
              { name: 'anzahl', type: 'INT', desc: 'Anzahl (bei Komparsen-Gruppen)' },
              { name: 'ist_gruppe', type: 'BOOL', desc: 'Gruppen-Eintrag?' },
            ]}
          />

          <TableCard title="szenen_vorstopp" color="#00C853"
            note="Vorstopp-Zeiten pro Phase"
            fields={[
              { name: 'id', type: 'SERIAL', desc: 'PK' },
              { name: 'scene_identity_id', type: 'UUID FK', desc: '→ scene_identities.id (stabil!)' },
              { name: 'stage', type: 'TEXT', desc: 'drehbuch | vorbereitung | dreh | schnitt' },
              { name: 'user_id', type: 'TEXT', desc: 'Wer hat gemessen' },
              { name: 'dauer_sekunden', type: 'INT', desc: 'Gemessene Zeit in Sekunden' },
              { name: 'methode', type: 'TEXT', desc: 'manuell | auto_seiten | auto_woerter' },
            ]}
          />
        </div>

        <TableCard title="szenen_revisionen" color={C.red}
          note="Delta-Tracking: Was hat sich geaendert?"
          fields={[
            { name: 'id', type: 'SERIAL', desc: 'PK' },
            { name: 'dokument_szene_id', type: 'UUID FK', desc: '→ dokument_szenen.id (pro Werkstufe)' },
            { name: 'field_type', type: 'TEXT', desc: 'header | content_block' },
            { name: 'field_name', type: 'TEXT', desc: 'ort_name, spieltag, etc.' },
            { name: 'old_value', type: 'TEXT', desc: 'Vorheriger Wert' },
            { name: 'new_value', type: 'TEXT', desc: 'Neuer Wert' },
          ]}
        />
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 5. Character-System */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="5. Character-Referenztabellen">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Charaktere sind globale Entitaeten (produktionsuebergreifend). Pro Staffel gibt es
          Produktions-Nummern und Kategorien.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <TableCard title="characters" color={C.blue}
            note="Globaler Charakter"
            fields={[
              { name: 'id', type: 'UUID', desc: 'PK' },
              { name: 'name', type: 'TEXT', desc: 'z.B. "Ben Lohmann"' },
              { name: 'meta_json', type: 'JSONB', desc: 'Erweiterte Daten' },
            ]}
          />
          <TableCard title="character_productions" color={C.purple}
            note="Produktionsspezifische Nummer"
            fields={[
              { name: 'character_id', type: 'UUID FK', desc: '→ characters.id' },
              { name: 'staffel_id', type: 'TEXT FK', desc: '→ staffeln.id' },
              { name: 'rollen_nummer', type: 'INT', desc: 'Rollenblatt-Nr.' },
              { name: 'komparsen_nummer', type: 'INT', desc: 'Komparsen-Nr.' },
              { name: 'kategorie_id', type: 'INT FK', desc: '→ character_kategorien.id' },
            ]}
          />
          <TableCard title="character_kategorien" color={C.gray}
            note="Besetzungs-Kategorie pro Staffel"
            fields={[
              { name: 'id', type: 'SERIAL', desc: 'PK' },
              { name: 'staffel_id', type: 'TEXT FK', desc: '→ staffeln.id' },
              { name: 'name', type: 'TEXT', desc: 'z.B. Hauptrolle' },
              { name: 'typ', type: 'TEXT', desc: 'rolle | komparse' },
            ]}
          />
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 6. Diff-Ansicht */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="6. Werkstufen-Vergleich (Diff-Ansicht)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Zwei Werkstufen werden verglichen. Szenen werden ueber <code>scene_identity_id</code> gematcht —
          auch bei unterschiedlicher Nummer oder Position.
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 60px 1fr',
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span>Werkstufe A (links)</span>
            <span style={{ textAlign: 'center', color: C.muted }}>Match</span>
            <span>Werkstufe B (rechts)</span>
          </div>

          {[
            { left: '1. INT. Kueche - TAG', right: '1. INT. Kueche - TAG', status: 'gleich', bg: 'transparent' },
            { left: '2. EXT. Garten - TAG', right: '2. EXT. Garten - ABEND', status: 'geaendert', bg: '#fef3c7' },
            { left: '3. INT. Buero - TAG', right: null, status: 'gestrichen', bg: '#fee2e2' },
            { left: null, right: '3. INT. Cafe - TAG', status: 'neu', bg: '#d1fae5' },
            { left: '4. EXT. Park - NACHT', right: '4. EXT. Park - NACHT', status: 'gleich', bg: 'transparent' },
          ].map((row, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 60px 1fr',
              padding: '8px 16px', borderBottom: `1px solid ${C.border}`,
              fontSize: 12,
            }}>
              <div style={{ background: row.left ? (row.status === 'gestrichen' ? '#fee2e2' : row.bg) : '#d1fae5', padding: '4px 8px', borderRadius: 4, opacity: row.left ? 1 : 0.4 }}>
                {row.left || <span style={{ fontStyle: 'italic', color: C.muted }}>— nicht vorhanden —</span>}
              </div>
              <div style={{ textAlign: 'center', alignSelf: 'center' }}>
                {row.status === 'gleich' && <span style={{ color: C.green }}>===</span>}
                {row.status === 'geaendert' && <span style={{ color: C.orange }}>=/=</span>}
                {row.status === 'gestrichen' && <span style={{ color: C.red }}>DEL</span>}
                {row.status === 'neu' && <span style={{ color: C.green }}>NEW</span>}
              </div>
              <div style={{ background: row.right ? (row.status === 'neu' ? '#d1fae5' : row.bg) : '#fee2e2', padding: '4px 8px', borderRadius: 4, opacity: row.right ? 1 : 0.4 }}>
                {row.right || <span style={{ fontStyle: 'italic', color: C.muted }}>— gestrichen —</span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 11, flexWrap: 'wrap' }}>
          {[
            { color: '#fef3c7', border: '#f59e0b', label: 'Geaendert', desc: 'Felder unterscheiden sich' },
            { color: '#d1fae5', border: '#10b981', label: 'Neu', desc: 'Nur in rechter Werkstufe' },
            { color: '#fee2e2', border: '#ef4444', label: 'Gestrichen', desc: 'geloescht=true oder nicht kopiert' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: l.color, border: `1px solid ${l.border}`, display: 'inline-block' }} />
              <strong>{l.label}</strong>
              <span style={{ color: C.muted }}>{l.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 7. Kritische Punkte */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="7. Kritische Punkte & Regeln">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <WarnBox title="1. Content lebt NUR in dokument_szenen.content">
            Es gibt kein separates <code>inhalt</code>-Feld auf Werkstufe/Fassung.
            Der Editor laedt und speichert ausschliesslich ueber <code>dokument_szenen</code>.
            Dies eliminiert die fruehre Redundanz zwischen <code>fassungen.inhalt</code> und{' '}
            <code>dokument_szenen.content</code>.
          </WarnBox>

          <WarnBox title="2. Version lebt NUR in werkstufen">
            <code>dokument_szenen</code> hat keine eigene Versionsnummer.
            Die Version wird ueber <code>werkstufe.version_nummer</code> + <code>werkstufe.typ</code> bestimmt.
            Eine Werkstufe IST die Version.
          </WarnBox>

          <WarnBox title="3. Scene Identity darf nie geloescht werden">
            Eine <code>scene_identity</code> ist die Klammer ueber alle Werkstufen.
            CASCADE DELETE wuerde alle <code>dokument_szenen</code>,{' '}
            <code>scene_characters</code> und <code>szenen_vorstopp</code> mitloeschen.
            Nur beim Loeschen einer ganzen Folge zulaessig.
          </WarnBox>

          <WarnBox title="4. Abgegeben-Flag blockiert alle Szenen">
            Wenn <code>werkstufe.abgegeben = true</code>, sind <strong>alle</strong> dokument_szenen
            dieser Werkstufe eingefroren. PUT-Requests werden mit HTTP 409 abgelehnt.
            Eine neue Werkstufe muss erstellt werden.
          </WarnBox>

          <WarnBox title="5. Kollaboration pro Werkstufe">
            Bearbeitung_status-Aenderungen (z.B. auf "collab") gelten fuer alle dokument_szenen
            einer Werkstufe. Jede dokument_szene hat ihren eigenen Yjs-Room, aber der Status
            wird zentral auf der Werkstufe gesteuert.
          </WarnBox>

          <InfoBox title="6. Content-JSONB Struktur" color={C.blue}>
            <code>dokument_szenen.content</code> ist ein Array von Textelementen:
            <div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 6, padding: 8, background: C.subtle, borderRadius: 6 }}>
              {'[{ id, type, text, character? }]'}<br />
              type: action | dialogue | parenthetical | character | transition | shot | heading
            </div>
          </InfoBox>

          <InfoBox title="7. Stoppzeit-Berechnung" color={C.green}>
            <code>SUM(stoppzeit_sek) WHERE werkstufe_id = X AND geloescht = false</code><br />
            Frontend formatiert: <code>270</code> → <code>"04:30"</code>.
            Addierbar fuer Gesamtlaenge des Buches.
          </InfoBox>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 8. API-Endpunkte */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="8. API-Endpunkte (Werkstufen-System)">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: C.subtle, borderBottom: `2px solid ${C.border}` }}>
              {['Methode', 'Pfad', 'Beschreibung'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { m: 'GET',    p: '/api/v2/folgen?staffel_id=X',             d: 'Alle Folgen einer Staffel' },
              { m: 'POST',   p: '/api/v2/folgen',                          d: 'Folge erstellen' },
              { m: 'PUT',    p: '/api/v2/folgen/:id',                      d: 'Folge aktualisieren (Titel)' },
              { m: 'GET',    p: '/api/v2/folgen/:folgeId/werkstufen',       d: 'Alle Werkstufen einer Folge' },
              { m: 'POST',   p: '/api/v2/folgen/:folgeId/werkstufen',      d: 'Neue Werkstufe (kopiert Vorgaenger)' },
              { m: 'GET',    p: '/api/werkstufen/:id',                     d: 'Einzelne Werkstufe' },
              { m: 'PUT',    p: '/api/werkstufen/:id',                     d: 'Status/Sichtbarkeit aendern' },
              { m: 'GET',    p: '/api/werkstufen/:id/szenen',              d: 'Alle Szenen einer Werkstufe' },
              { m: 'POST',   p: '/api/werkstufen/:id/szenen',              d: 'Neue Szene hinzufuegen' },
              { m: 'PATCH',  p: '/api/werkstufen/:id/szenen/reorder',      d: 'Szenen-Reihenfolge aendern' },
              { m: 'POST',   p: '/api/werkstufen/:id/szenen/renumber',     d: 'Sequentiell umnummerieren' },
              { m: 'GET',    p: '/api/werkstufen/:a/szenen/diff/:b',       d: 'Werkstufen-Vergleich (Diff)' },
              { m: 'GET',    p: '/api/dokument-szenen/:id',                d: 'Einzelne Szene laden' },
              { m: 'PUT',    p: '/api/dokument-szenen/:id',                d: 'Szenenkopf aktualisieren' },
              { m: 'DELETE', p: '/api/dokument-szenen/:id',                d: 'Soft-Delete (geloescht=true)' },
              { m: 'GET',    p: '/api/scene-identities/:id/characters',    d: 'Charaktere einer Szene' },
              { m: 'POST',   p: '/api/scene-identities/:id/characters',    d: 'Charakter hinzufuegen' },
              { m: 'GET',    p: '/api/scene-identities/:id/vorstopp',      d: 'Vorstopp-Zeiten laden' },
              { m: 'POST',   p: '/api/scene-identities/:id/vorstopp',      d: 'Vorstopp-Eintrag hinzufuegen' },
              { m: 'GET',    p: '/api/scene-identities/:id/history',       d: 'Szene ueber alle Werkstufen' },
              { m: 'GET',    p: '/api/stages/werkstufe/:werkId/export/fountain', d: 'Export Fountain' },
              { m: 'GET',    p: '/api/stages/werkstufe/:werkId/export/fdx',     d: 'Export Final Draft XML' },
              { m: 'GET',    p: '/api/stages/werkstufe/:werkId/export/pdf',     d: 'Export HTML (druckbar)' },
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 10px' }}>
                  <Badge color={
                    r.m === 'GET' ? C.green : r.m === 'POST' ? C.blue :
                    r.m === 'PUT' ? C.orange : r.m === 'PATCH' ? C.purple : C.red
                  }>{r.m}</Badge>
                </td>
                <td style={{ padding: '6px 10px' }}>
                  <code style={{ fontSize: 10, wordBreak: 'break-all' }}>{r.p}</code>
                </td>
                <td style={{ padding: '6px 10px', color: C.muted }}>{r.d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 9. Migrations-Roadmap */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="9. Migrations-Roadmap (8 Phasen)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            { phase: '1', name: 'Migration: Neue Tabellen + Datenmigration', desc: 'v43 deployed — folgen, werkstufen, scene_identities.folge_id, dokument_szenen.werkstufe_id', risk: 'erledigt', color: C.green },
            { phase: '2', name: 'Backend: Neue Routen (parallel)', desc: 'Deployed — /api/v2/folgen, /api/v2/folgen/:id/werkstufen, /api/werkstufen/:id/szenen', risk: 'erledigt', color: C.green },
            { phase: '3', name: 'Import-System umbauen', desc: 'Deployed — Import schreibt Dual-Write in folgen + werkstufen', risk: 'erledigt', color: C.green },
            { phase: '4', name: 'Frontend: Editor-Refactoring', desc: 'Deployed — ScriptPage laedt Werkstufen-Szenen, stoppzeit_sek mm:ss', risk: 'erledigt', color: C.green },
            { phase: '5', name: 'Kollaboration anpassen', desc: 'Deployed — szene-{id} Rooms, yjs_state auf dokument_szenen, Werkstufe-Status-Check', risk: 'erledigt', color: C.green },
            { phase: '6', name: 'Export-System anpassen', desc: 'Deployed — /api/stages/werkstufe/:werkId/export/{fountain,fdx,pdf}', risk: 'erledigt', color: C.green },
            { phase: '7', name: 'Cleanup: Alte Tabellen droppen', desc: 'Deployed — folgen_meta + v_legacy_data_status entfernt, dual-writes gestoppt, folgen.ts auf folgen-Tabelle migriert', risk: 'erledigt', color: C.green },
            { phase: '8', name: 'Tests + HilfePage', desc: 'Deployed — 30+ Playwright-Tests, HilfePage API-Pfade aktualisiert', risk: 'erledigt', color: C.green },
          ].map(m => (
            <div key={m.phase} style={{
              display: 'flex', alignItems: 'baseline', gap: 12,
              padding: '8px 12px', borderRadius: 6,
              background: C.subtle,
              borderLeft: `3px solid ${m.color}`,
            }}>
              <Badge color={C.blue}>Phase {m.phase}</Badge>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 12 }}>{m.name}</strong>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{m.desc}</div>
              </div>
              <Badge color={m.color}>{m.risk}</Badge>
            </div>
          ))}
        </div>
        <InfoBox title="Empfohlene Reihenfolge" color={C.blue}>
          1 → 2 → 3 + 6 (parallel) → 4 → 5 → 8 → 7 (Cleanup ganz am Ende)
        </InfoBox>
      </Section>

    </div>
  )
}

function HilfePage() {
  const [activeTab, setActiveTab] = useState<'offline' | 'datenmodell' | 'nummerierung' | 'dokument-editor' | 'kommentare' | 'szenen-fassungen'>('offline')
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
            { id: 'dokument-editor', label: 'Dokument-Editor',      icon: '📝' },
            { id: 'kommentare',   label: 'Kommentare',            icon: '💬' },
            { id: 'szenen-fassungen', label: 'Szenen & Fassungen',  icon: '🔀' },
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

        {activeTab === 'dokument-editor' && <DokumentEditorHilfeTab />}

        {activeTab === 'kommentare' && <KommentareTab />}

        {activeTab === 'szenen-fassungen' && <SzenenFassungenTab />}

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

            {/* folgen_meta — DROPPED in v44 */}
            <TableCard
              title="folgen_meta (DROPPED)"
              color={C.gray}
              note="Entfernt in v44 — Daten in folgen-Tabelle migriert"
              fields={[]}
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
                { name: 'content',       type: 'JSONB []',  desc: 'Szenentext als Textelement-Array — siehe Abschnitt 3' },
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
            <code>szenen.content</code> ist ein Array von Textelementen. Jedes Textelement hat mindestens <code>type</code> und <code>text</code>.
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
            <strong style={{ fontSize: 12 }}>Textelement-Typen:</strong>
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
                { name: 'line_ref',    type: 'TEXT',   desc: 'Textelement-Referenz im content-Array' },
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
