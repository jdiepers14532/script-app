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
              <div><Badge color={C.purple}>NetworkFirst</Badge> <code style={{ color: C.muted }}>/api/produktionen</code> — 10s Timeout → Cache Fallback</div>
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
// Szenenuebersicht & Editor Tab
// ══════════════════════════════════════════════════════════════════════════════
function SzenenEditorTab() {
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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Szenenuebersicht (Sidebar) & Szenen-Editor</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Die Script-App ist ein <strong>Per-Szene-Editor</strong>: Es wird immer nur eine einzelne Szene bearbeitet.
          Die Szenenuebersicht (linke Sidebar) zeigt alle Szenen der aktuellen Werkstufe,
          der Szenen-Editor (Kopfbereich rechts) zeigt die Metadaten und den Content der ausgewaehlten Szene.
          Darunter schliessen sich die Dokument-Editor-Panels (Storyline / Drehbuch) an.
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 1. Gesamtlayout */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="1. Gesamtlayout — Zusammenspiel der Komponenten">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Die <strong>ScriptPage</strong> orchestriert alle Teile. Das Layout besteht aus drei Hauptbereichen,
          die horizontal nebeneinander liegen:
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Layout-Aufbau (horizontal)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 2fr 24px 1fr', gap: 0, padding: 16, alignItems: 'stretch' }}>
            {/* Scene List */}
            <div style={{ border: `2px solid ${C.blue}`, borderRadius: 8, padding: 12, background: C.blue + '08' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.blue, marginBottom: 6 }}>SceneList</div>
              <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                Suchfeld<br/>
                Szenen-Zeilen<br/>
                Drag&Drop<br/>
                Kontextmenu<br/>
                Kommentar-Badges
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, color: C.muted }}>|</span>
            </div>
            {/* Editor area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ border: `2px solid ${C.green}`, borderRadius: 8, padding: 10, background: C.green + '08' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.green, marginBottom: 4 }}>SceneEditor (Kopf)</div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  SZ-Nr · Stoppzeit · Motiv · I/A · DT<br/>
                  Zusammenfassung · Rollen · Komparsen · Szeneninfo<br/>
                  Annotationen-Button · PDF-Export
                </div>
              </div>
              <div style={{ border: `2px solid ${C.orange}`, borderRadius: 8, padding: 10, background: C.orange + '08', flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.orange, marginBottom: 4 }}>DockedEditorPanels</div>
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
                  Storyline-Panel (links) | Drehbuch-Panel (rechts)<br/>
                  Side-by-Side oder Einzelansicht<br/>
                  Resizable Splitter
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, color: C.muted }}>|</span>
            </div>
            {/* Breakdown */}
            <div style={{ border: `2px dashed ${C.purple}55`, borderRadius: 8, padding: 12, background: C.purple + '06' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.purple, marginBottom: 6 }}>BreakdownPanel</div>
              <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                Vorstopp<br/>
                Charaktere<br/>
                Motive<br/>
                (ausblendbar mit Focus-Mode)
              </div>
            </div>
          </div>
        </div>

        <InfoBox title="Per-Szene-Prinzip" color={C.blue}>
          Der Editor zeigt <strong>immer nur den Inhalt EINER Szene</strong> an.
          Szenenwechsel erfolgt durch Klick in der SceneList, Pfeiltasten (links/rechts), oder Overscroll im Editor.
          Komplette Drehbuecher werden erst beim <strong>Export</strong> zusammengefuegt.
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 2. Szenenuebersicht (SceneList) */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="2. Szenenuebersicht (SceneList)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Die linke Sidebar zeigt alle Szenen der aktuellen Werkstufe als kompakte Liste.
          Breite ist per Drag resize-bar und per Collapse-Button ein-/ausklappbar.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Funktionen */}
          <div style={{
            border: `1px solid ${C.blue}33`,
            borderRadius: 10, padding: 16, background: C.blue + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 10 }}>Funktionen</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li><strong>Suche</strong> — filtert nach Szenennummer, Motivname, Zusammenfassung</li>
                <li><strong>Farbkodierung</strong> — INT/EXT + Tageszeit bestimmen Farbstreifen (3 Modi: full/subtle/off)</li>
                <li><strong>Drag & Drop</strong> — Szenen per Drag umsortieren (nur wenn keine Suche aktiv)</li>
                <li><strong>Kontextmenu</strong> — "Einfuegen darunter" (Suffix-System) + "Loeschen" (Soft-Delete)</li>
                <li><strong>Neu nummerieren</strong> — Header-Menu: sequentielle Nummerierung oder Position-Logging</li>
                <li><strong>Neue Szene</strong> — Plus-Button: fuegt am Ende an</li>
                <li><strong>Kommentar-Badge</strong> — zeigt ungelesene Annotationen aus messenger.app</li>
                <li><strong>Lock-Indikator</strong> — wenn Episode gelockt ist</li>
                <li><strong>Szeneninfo-Tooltip</strong> — Info-Icon zeigt redaktionelle Hinweise</li>
              </ul>
            </div>
          </div>

          {/* Szenen-Zeile */}
          <div style={{
            border: `1px solid ${C.green}33`,
            borderRadius: 10, padding: 16, background: C.green + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 10 }}>Szenen-Zeile (Aufbau)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
              Jede Zeile zeigt:
              <div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 8, padding: 8, background: C.subtle, borderRadius: 6, lineHeight: 1.7 }}>
                [Farbstreifen] [Nr] [Motivname] [I/A] [Dauer] [Badges] [...Menu]
              </div>
              <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
                <li><strong>Nr</strong> = scene_nummer + suffix (z.B. "5a")</li>
                <li><strong>Motivname</strong> = ort_name</li>
                <li><strong>I/A</strong> = int_ext Abkuerzung</li>
                <li><strong>Badges</strong> = Kommentare, Lock, Szeneninfo</li>
                <li>Aktive Szene: hervorgehoben, kein Farbstreifen</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Resize & Collapse */}
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 10, padding: 16,
          marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Resize & Collapse</div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li><strong>Drag-Handle</strong> — zwischen SceneList und Editor; Breite per Drag anpassbar (min. 180px)</li>
              <li><strong>Collapse-Button</strong> — Chevron-Icon auf dem Handle; blendet Sidebar komplett aus</li>
              <li><strong>State persistent</strong> — Collapsed-Zustand wird in User-Settings gespeichert</li>
            </ul>
          </div>
        </div>

        <WarnBox title="Drag & Drop nur bei leerer Suche">
          Wenn das Suchfeld Text enthaelt, ist Drag & Drop deaktiviert.
          Die gefilterte Ansicht wuerde sonst zu unerwarteten Umsortierungen fuehren.
        </WarnBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 3. Szenen-Editor (Kopfbereich) */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="3. Szenen-Editor (SceneEditor)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Der SceneEditor zeigt die Metadaten der ausgewaehlten Szene und den importierten Content.
          Alle Felder sind <strong>inline-editierbar</strong> mit Auto-Save bei onBlur.
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Zeile 1 — Hauptleiste</div>
          <div style={{ padding: '12px 16px', fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            <div style={{ fontFamily: 'monospace', fontSize: 10, padding: 8, background: C.subtle, borderRadius: 6, marginBottom: 10 }}>
              SZ[Nr] | [Stoppzeit mm:ss] | [Motivname] | Speicherstatus | [Sp HH:MM] | [I/A] · [DT] | [Annotationen] [PDF]
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {[
                  { field: 'SZ-Nummer', desc: 'Read-only, aus scene_nummer + suffix', edit: 'Nein' },
                  { field: 'Stoppzeit', desc: 'mm:ss Input — gespeichert als stoppzeit_sek INT (Sekunden)', edit: 'Ja (onBlur)' },
                  { field: 'Motiv', desc: 'ort_name — wächst und füllt den verfügbaren Platz', edit: 'Nein (nur in Header-Feldern)' },
                  { field: 'Spielzeit (Sp)', desc: 'Wahrscheinliche Uhrzeit der Handlung, z.B. "08:30"', edit: 'Ja (onBlur)' },
                  { field: 'I/A Toggle', desc: 'Klick wechselt INT ↔ EXT (sofort gespeichert)', edit: 'Ja (onClick)' },
                  { field: 'Tageszeit Toggle', desc: 'Klick cycled TAG → NACHT → ABEND (sofort gespeichert)', edit: 'Ja (onClick)' },
                  { field: 'DT (Dramaturgischer Tag)', desc: 'Erzähltag der Geschichte (1 = erster Tag)', edit: 'Ja (onBlur)' },
                  { field: 'Annotationen-Button', desc: 'Öffnet/schliesst Annotations-Panel (messenger.app)', edit: '—' },
                  { field: 'PDF-Button', desc: 'Exportiert gesamte Werkstufe als PDF (neues Fenster)', edit: '—' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.field}</td>
                    <td style={{ padding: '5px 8px' }}>{r.desc}</td>
                    <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: r.edit === 'Nein' ? C.red : C.green }}>{r.edit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Zeilen 2–5 — Metadaten-Felder</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              <li><strong>Zusammenfassung</strong> — Freitext-Input (Oneliner), gespeichert in <code>zusammenfassung</code></li>
              <li><strong>R· Rollen</strong> — Auflistung aller scene_characters mit <code>kategorie_typ = 'rolle'</code></li>
              <li><strong>K· Komparsen</strong> — Auflistung aller scene_characters mit <code>kategorie_typ = 'komparse'</code></li>
              <li><strong>Szeneninfo</strong> — nur sichtbar wenn belegt; redaktioneller Hinweis (hellblau, kursiv)</li>
            </ul>
          </div>
        </div>

        {/* Content-Bereich */}
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Content-Bereich (unterhalb Header)</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            Zeigt den importierten Szenentext als Read-Only-Darstellung (Screenplay-Formatierung):
            <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
              <li><code>character</code> → zentriert, fett, Grossbuchstaben</li>
              <li><code>dialogue</code> → eingerueckt links/rechts (80px)</li>
              <li><code>parenthetical</code> → kursiv, leicht eingerueckt</li>
              <li><code>direction / action</code> → kursiv, sekundaerfarbe</li>
              <li><code>shot</code> → fett, hellblau</li>
            </ul>
            <strong>Hinweis:</strong> Der editierbare Tiptap-Editor (EditorPanel) sitzt darunter in den DockedEditorPanels.
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 4. Navigation & Overscroll */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="4. Navigation zwischen Szenen">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

          <div style={{
            border: `1px solid ${C.blue}33`,
            borderRadius: 10, padding: 16, background: C.blue + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.blue, marginBottom: 8 }}>Klick (SceneList)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Klick auf eine Szenen-Zeile laedt diese Szene im Editor.
              Navigation wird persistent gespeichert (last_szene_id in user_settings).
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.green}33`,
            borderRadius: 10, padding: 16, background: C.green + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 8 }}>Pfeiltasten</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <code>←</code> / <code>→</code> = vorherige/naechste Szene (throttled 200ms)<br />
              <code>↑</code> / <code>↓</code> = vorherige/naechste Episode (throttled 400ms, block-uebergreifend)<br />
              Nur aktiv wenn kein Input/Textarea fokussiert.
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.orange}33`,
            borderRadius: 10, padding: 16, background: C.orange + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.orange, marginBottom: 8 }}>Overscroll</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Am Ende/Anfang des Editor-Inhalts weiterscrollen → naechste/vorherige Szene nach Delay.
              Delay konfigurierbar in User-Preferences (<code>scrollNavDelay</code>).
            </div>
          </div>
        </div>

        <InfoBox title="Deep-Link Support" color={C.blue}>
          URL-Parameter <code>?scene=ID&produktion=X&folge=N&stage=S</code> navigiert direkt zur Szene.
          Wird von messenger.app fuer Annotationen-Links genutzt.
          Nach Auswertung wird die URL gesaeubert (history.replaceState).
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 5. Daten-Flow */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="5. Daten-Flow: Wie alles zusammenhaengt">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Die ScriptPage laedt Szenen aus dem Werkstufen-System (v2). Aeltere Daten werden ueber Fallback geladen.
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Lade-Kaskade (ScriptPage)</div>
          <div style={{ padding: '16px 20px', fontSize: 12, color: C.muted, lineHeight: 1.8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { step: '1', label: 'Produktion sync', desc: 'AppShell → /api/produktionen/sync → produktion_id' },
                { step: '2', label: 'Bloecke laden', desc: '/api/bloecke/:produktionId → Block-Auswahl' },
                { step: '3', label: 'Folge bestimmen', desc: 'Block.folge_von..folge_bis → Folgen-Nr' },
                { step: '4', label: 'Stages laden', desc: '/api/stages/:produktionId/:folgeNr → Stage-Tabs' },
                { step: '5', label: 'Werkstufen pruefen', desc: '/api/v2/folgen → folge_id → /api/folgen/:id/werkstufen → passender Typ' },
                { step: '6', label: 'Szenen laden', desc: '/api/werkstufen/:werkId/szenen → SceneList + SceneEditor' },
                { step: '7', label: 'Szene auswaehlen', desc: 'Erste Szene oder saved last_szene_id → SceneEditor laedt Details' },
              ].map((s) => (
                <div key={s.step} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <Badge color={C.blue}>{s.step}</Badge>
                  <strong style={{ fontSize: 11, minWidth: 130 }}>{s.label}</strong>
                  <code style={{ fontSize: 10 }}>{s.desc}</code>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>SceneEditor — was wird geladen pro Szene?</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Daten</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>API-Endpunkt</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px' }}>Verknuepft via</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { data: 'Szenen-Metadaten + Content', api: 'GET /api/dokument-szenen/:id', via: 'dokument_szene.id (UUID)' },
                  { data: 'Charaktere (Rollen + Komparsen)', api: 'GET /api/scene-identities/:id/characters', via: 'scene_identity_id (stabil!)' },
                  { data: 'Vorstopp-Zeiten', api: 'GET /api/scene-identities/:id/vorstopp', via: 'scene_identity_id' },
                  { data: 'Revision-Deltas', api: 'GET /api/dokument-szenen/:id/revisionen', via: 'dokument_szene.id' },
                  { data: 'Kommentar-Anzahl', api: 'GET /api/szenen/:id/kommentare', via: 'szene.id (Legacy)' },
                  { data: 'Annotationen', api: 'GET /api/szenen/:id/annotations', via: 'szene.id' },
                ].map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: '5px 8px', fontWeight: 500 }}>{r.data}</td>
                    <td style={{ padding: '5px 8px' }}><code style={{ fontSize: 10 }}>{r.api}</code></td>
                    <td style={{ padding: '5px 8px', fontSize: 10 }}>{r.via}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <WarnBox title="Zwei ID-Systeme (Werkstufe vs. Legacy)">
          Szenen aus dem Werkstufen-System haben <strong>UUID-IDs</strong> (<code>typeof szeneId === 'string'</code>).
          Legacy-Szenen haben <strong>numerische IDs</strong> (<code>typeof szeneId === 'number'</code>).
          SceneEditor und SceneList behandeln beide Faelle per <code>useDokumentSzenen</code>-Flag.
        </WarnBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 6. Auto-Save & Speichern */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="6. Auto-Save & Speicherlogik">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{
            border: `1px solid ${C.green}33`,
            borderRadius: 10, padding: 16, background: C.green + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 8 }}>Header-Felder (Metadaten)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Speichern bei <code>onBlur</code> oder <code>onClick</code> (Toggles).<br />
              Sofortiger PUT auf <code>/api/dokument-szenen/:id</code>.<br />
              Response aktualisiert lokalen State + SceneList.
            </div>
          </div>

          <div style={{
            border: `1px solid ${C.orange}33`,
            borderRadius: 10, padding: 16, background: C.orange + '06',
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.orange, marginBottom: 8 }}>Content (Editor-Text)</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Debounced Auto-Save: 3 Sekunden nach letzter Aenderung.<br />
              Speichert via PUT <code>{'{ content: [...] }'}</code>.<br />
              Statusanzeige: "Speichert…" → "Gespeichert" (2s sichtbar).
            </div>
          </div>
        </div>

        <InfoBox title="Revision Tracking" color={C.purple}>
          Bei jeder Speicherung im Legacy-System wird eine <code>szenen_version</code> erstellt (Auto-save).
          Im Werkstufen-System werden stattdessen Revisionen in <code>szenen_revisionen</code> nachverfolgt
          (Content-Blocks mit * markiert, Revision-Color aus Admin-Settings).
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 7. Annotations */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="7. Annotationen (messenger.app-Integration)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Jede Szene kann Annotationen haben — Kommentare aus der messenger.app, verknuepft ueber die Szenen-ID.
        </p>

        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
        }}>
          <div style={{
            background: C.subtle, padding: '10px 16px', fontWeight: 700, fontSize: 12,
            borderBottom: `1px solid ${C.border}`,
          }}>Annotations-Flow</div>
          <div style={{ padding: '12px 16px', fontSize: 11, color: C.muted, lineHeight: 1.8 }}>
            <ol style={{ margin: 0, paddingLeft: 16 }}>
              <li>SceneList zeigt <strong>Kommentar-Badge</strong> (Sprechblase + Zahl) fuer ungelesene Annotationen</li>
              <li>Klick auf Annotations-Button im SceneEditor oeffnet das Panel</li>
              <li>Panel zeigt alle Annotationen chronologisch + Eingabefeld fuer neue</li>
              <li>Neue Annotation → POST an Backend → messenger.app wird benachrichtigt</li>
              <li>Beim Schliessen des Panels werden Kommentare als gelesen markiert</li>
              <li>Link "Messenger" oeffnet die volle messenger.app in neuem Tab</li>
            </ol>
          </div>
        </div>

        <InfoBox title="Unread-Count Polling" color={C.green}>
          Die ScriptPage pollt alle 60 Sekunden <code>/api/scene-comment-counts?stage_id=X</code>
          und reicht die Counts an SceneList weiter. So bleiben Badges aktuell ohne WebSocket.
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 8. Farbkodierung */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="8. Farbkodierung (INT/EXT + Tageszeit)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Szenen werden basierend auf INT/EXT und Tageszeit farblich kodiert.
          Die Farbe bestimmt Streifen in der SceneList und den Header-Akzent im Editor.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { key: 'INT + TAG', color: '#E3F2FD', stripe: '#42A5F5' },
            { key: 'EXT + TAG', color: '#E8F5E9', stripe: '#66BB6A' },
            { key: 'INT/EXT + TAG', color: '#FFF3E0', stripe: '#FFA726' },
            { key: 'INT + NACHT', color: '#1a237e', stripe: '#5C6BC0' },
            { key: 'EXT + NACHT', color: '#1b5e20', stripe: '#26A69A' },
            { key: 'ABEND', color: '#4a148c', stripe: '#AB47BC' },
          ].map(c => (
            <div key={c.key} style={{
              border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '8px 12px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 4, height: 28, borderRadius: 2, background: c.stripe, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 600 }}>{c.key}</div>
                <div style={{ fontSize: 9, color: C.muted, fontFamily: 'monospace' }}>{c.stripe}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

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
          5 Kerntabellen: <code>produktionen</code> → <code>folgen</code> → <code>scene_identities</code> +{' '}
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
          Die Hierarchie: <strong>Produktion → Folge → Scene Identity + Werkstufe → Dokument-Szene</strong>.{' '}
          <code>dokument_szenen</code> ist die N:M-Kreuzungstabelle zwischen Szenen und Werkstufen.
        </p>

        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 24,
          overflowX: 'auto',
        }}>
          {/* Top row: produktionen → folgen */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ minWidth: 180, flexShrink: 0 }}>
              <TableCard title="produktionen" color={C.blue}
                note="Produktion (v47: renamed von staffeln)"
                fields={[
                  { name: 'id', type: 'TEXT', desc: 'Slug (PK)' },
                  { name: 'titel', type: 'TEXT', desc: 'Anzeigename' },
                  { name: 'produktion_db_id', type: 'UUID', desc: 'Ext. Produktions-DB' },
                  { name: 'seitenformat', type: 'TEXT', desc: 'a4 | us_letter (v47)' },
                ]}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center', flexShrink: 0 }}>
              <Connector direction="right" label="1 : n" />
            </div>

            <div style={{ minWidth: 280, flexShrink: 0 }}>
              <TableCard title="folgen" color={C.purple}
                note="Eine Episode (merged, v47: meta_json entfernt)"
                fields={[
                  { name: 'id', type: 'SERIAL', desc: 'PK' },
                  { name: 'produktion_id', type: 'TEXT FK', desc: '→ produktionen.id (v47: renamed von staffel_id)' },
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
                note="Stabile UUID — existiert ueber alle Werkstufen (v47: staffel_id entfernt)"
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
                  { name: 'stand_datum', type: 'DATE', desc: 'Dokumentdatum / "Stand" (v48)' },
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
                { name: 'szeneninfo', type: 'TEXT', desc: 'Redaktionelle Hinweise (z.B. Block-Zuordnung)' },
                { name: 'geloescht', type: 'BOOL', desc: 'Soft-Delete (bleibt fuer Diff)' },
                { name: 'is_wechselschnitt', type: 'BOOL', desc: 'Wechselschnitt-Szene (Legacy)' },
                { name: 'sondertyp', type: 'TEXT', desc: "NULL|'wechselschnitt'|'stockshot'|'flashback'" },
                { name: 'stockshot_kategorie', type: 'TEXT', desc: "'ortswechsel'|'zeit_vergeht'|'stimmungswechsel'" },
                { name: 'stockshot_stimmung', type: 'TEXT', desc: 'Stimmung bei Stimmungswechsel' },
                { name: 'stockshot_neu_drehen', type: 'BOOL', desc: 'Muss neu gefilmt werden' },
                { name: 'flashback_referenz_id', type: 'UUID', desc: 'FK → scene_identities (Ursprungsszene)' },
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
                'scene_characters mitkopieren (neue werkstufe_id)',
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
            note="Welche Charaktere spielen in dieser Szene? (v46: werkstufe_id hinzugefuegt)"
            fields={[
              { name: 'id', type: 'SERIAL', desc: 'PK' },
              { name: 'scene_identity_id', type: 'UUID FK', desc: '→ scene_identities.id (stabil!)' },
              { name: 'werkstufe_id', type: 'UUID FK', desc: '→ werkstufen.id (bei Werkstufe-Copy mitkopiert)' },
              { name: 'character_id', type: 'UUID FK', desc: '→ characters.id' },
              { name: 'kategorie_id', type: 'INT FK', desc: '→ character_kategorien.id' },
              { name: 'anzahl', type: 'INT', desc: 'Anzahl (bei Komparsen-Gruppen)' },
              { name: 'spiel_typ', type: 'TEXT', desc: 'Spiel-Typ (Haupt/Neben/Stumm)' },
              { name: 'repliken_anzahl', type: 'INT', desc: 'Anzahl Repliken (auto-berechnet)' },
              { name: 'header_o_t', type: 'TEXT', desc: 'O.T.-Markierung im Szenenkopf' },
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
              { name: 'produktion_id', type: 'TEXT FK', desc: '→ produktionen.id' },
              { name: 'rollen_nummer', type: 'INT', desc: 'Rollenblatt-Nr.' },
              { name: 'komparsen_nummer', type: 'INT', desc: 'Komparsen-Nr.' },
              { name: 'kategorie_id', type: 'INT FK', desc: '→ character_kategorien.id' },
            ]}
          />
          <TableCard title="character_kategorien" color={C.gray}
            note="Besetzungs-Kategorie pro Staffel"
            fields={[
              { name: 'id', type: 'SERIAL', desc: 'PK' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '→ produktionen.id' },
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
              { m: 'GET',    p: '/api/v2/folgen?produktion_id=X',             d: 'Alle Folgen einer Produktion' },
              { m: 'POST',   p: '/api/v2/folgen',                          d: 'Folge erstellen' },
              { m: 'PUT',    p: '/api/v2/folgen/:id',                      d: 'Folge aktualisieren (Titel)' },
              { m: 'GET',    p: '/api/folgen/:folgeId/werkstufen',          d: 'Alle Werkstufen einer Folge' },
              { m: 'POST',   p: '/api/folgen/:folgeId/werkstufen',         d: 'Neue Werkstufe (kopiert Vorgaenger + Characters)' },
              { m: 'GET',    p: '/api/werkstufen/:id',                     d: 'Einzelne Werkstufe (inkl. szenen_count)' },
              { m: 'PUT',    p: '/api/werkstufen/:id',                     d: 'Status/Sichtbarkeit/Label/stand_datum aendern' },
              { m: 'DELETE', p: '/api/werkstufen/:id',                     d: 'Werkstufe loeschen (CASCADE)' },
              { m: 'GET',    p: '/api/werkstufen/:werkId/szenen',          d: 'Alle Szenen einer Werkstufe' },
              { m: 'POST',   p: '/api/werkstufen/:werkId/szenen',          d: 'Neue Szene hinzufuegen' },
              { m: 'PATCH',  p: '/api/werkstufen/:werkId/szenen/reorder',  d: 'Szenen-Reihenfolge aendern' },
              { m: 'POST',   p: '/api/werkstufen/:werkId/szenen/renumber', d: 'Sequentiell umnummerieren' },
              { m: 'GET',    p: '/api/werkstufen/:a/szenen/diff/:b',       d: 'Werkstufen-Vergleich (Diff)' },
              { m: 'GET',    p: '/api/dokument-szenen/:id',                d: 'Einzelne Szene laden' },
              { m: 'PUT',    p: '/api/dokument-szenen/:id',                d: 'Szenenkopf + Content aktualisieren' },
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
      <Section title="9. Migrations-Roadmap (8 Phasen + Folge-Migrationen)">
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
            { phase: 'v46', name: 'Statistik + werkstufe_id auf scene_characters', desc: 'Deployed — scene_characters.werkstufe_id, statistik_vorlagen-Tabelle, Werkstufe-Copy kopiert Characters', risk: 'erledigt', color: C.green },
            { phase: 'v47', name: 'Clean-Start: staffeln → produktionen', desc: 'Deployed — TRUNCATE + Rename, seitenformat-Spalte, scene_identities.staffel_id entfernt, alle FKs umbenannt', risk: 'erledigt', color: C.green },
            { phase: 'v48', name: 'stand_datum auf werkstufen', desc: 'Deployed — DATE-Feld fuer Dokumentdatum (PDF-Cover "Stand")', risk: 'erledigt', color: C.green },
            { phase: 'v49', name: 'Drop stimmung', desc: 'Deployed — ungenutzte stimmung-Spalte von szenen + dokument_szenen entfernt', risk: 'erledigt', color: C.green },
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

// ── Datenmodell Tab (komplett, Stand v50) ────────────────────────────────────

function NetzplanDiagram() {
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(0.42)
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState<string | null>(null)

  const TW = 330, FH = 16, HH = 24, GAP = 22
  type F = [string, string, string, string?] // [name, type, desc, fk_target?]
  type T = { id: string; g: string; f: F[] }

  const defs: T[] = [
    { id:'produktionen', g:'core', f:[['id','TEXT PK','Produktions-ID'],['titel','TEXT','Anzeigename'],['produktion_db_id','UUID','FK zur Prod-DB'],['meta_json','JSONB','Flexible Metadaten'],['seitenformat','TEXT','a4 (default)'],['created_at','TSTZ','Erstellt'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'folgen', g:'core', f:[['id','SERIAL PK','Episoden-Key'],['produktion_id','TEXT FK','Produktion','produktionen'],['folge_nummer','INT','Episodennummer (UNIQUE)'],['folgen_titel','TEXT','Arbeitstitel'],['air_date','DATE','Sendedatum'],['synopsis','TEXT','Synopsis'],['produktion_db_id','UUID','Link zur Prod-DB'],['erstellt_von','TEXT','user_id'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'scene_identities', g:'core', f:[['id','UUID PK','Stabile Szenen-UUID'],['folge_id','INT FK','Episode','folgen'],['created_by','TEXT','Ersteller'],['created_at','TSTZ','Erstellt']]},
    { id:'werkstufen', g:'core', f:[['id','UUID PK','Werkstufen-ID'],['folge_id','INT FK','Episode','folgen'],['typ','TEXT','drehbuch|storyline|notiz'],['version_nummer','INT','Version (1,2,3...)'],['label','TEXT','z.B. Blaue Seiten'],['sichtbarkeit','TEXT','privat|team|alle'],['abgegeben','BOOL','Eingefroren?'],['bearbeitung_status','TEXT','entwurf|in_review|approved'],['erstellt_von','TEXT','user_id'],['erstellt_am','TSTZ','Erstellt'],['stand_datum','DATE','Stand-Datum']]},
    { id:'dokument_szenen', g:'core', f:[['id','UUID PK','Szenen-Instanz'],['werkstufe_id','UUID FK','Werkstufe','werkstufen'],['scene_identity_id','UUID FK','Stabile SZ-ID','scene_identities'],['sort_order','INT','Reihenfolge'],['scene_nummer','INT','Szenennummer'],['scene_nummer_suffix','VARCHAR','a, b (WGA)'],['ort_name','TEXT','Motivname'],['int_ext','TEXT','INT|EXT|INT/EXT'],['tageszeit','TEXT','TAG|NACHT|ABEND'],['spieltag','INT','Drehtag-Index'],['spielzeit','TEXT','Spielzeit-Info'],['zusammenfassung','TEXT','Kurzbeschreibung'],['szeneninfo','TEXT','Redaktionelle Hinweise'],['seiten','TEXT','Seitenzahl (2 5/8)'],['dauer_min','INT','Dauer Min (Legacy)'],['dauer_sek','INT','Dauer Sek (Legacy)'],['is_wechselschnitt','BOOL','Legacy WS-Flag'],['sondertyp','TEXT','wechselschnitt|stockshot|flashback'],['stockshot_kategorie','TEXT','ortswechsel|zeit_vergeht|stimmungswechsel'],['stockshot_stimmung','TEXT','Stimmungswert'],['stockshot_neu_drehen','BOOL','Neu zu drehen?'],['flashback_referenz_id','UUID FK','Ursprungsszene','scene_identities'],['content','JSONB','ProseMirror JSON'],['format','TEXT','Editor-Typ'],['stoppzeit_sek','INT','Spieldauer Sek'],['geloescht','BOOL','Soft-Delete'],['yjs_state','BYTEA','Yjs Collab State'],['updated_by','TEXT','Letzter Bearbeiter'],['updated_at','TSTZ','Letzte Aenderung']]},
    { id:'wechselschnitt_partner', g:'core', f:[['id','UUID PK','Partner-ID'],['dokument_szene_id','UUID FK','WS-Szene','dokument_szenen'],['partner_identity_id','UUID FK','Partner-Szene','scene_identities'],['position','INT','Reihenfolge']]},
    { id:'stockshot_archiv', g:'core', f:[['id','UUID PK','Archiv-ID'],['produktion_id','TEXT','Staffel'],['motiv_name','TEXT','Motivname'],['motiv_id','UUID FK','Motiv','motive'],['lichtstimmung','TEXT','z.B. TAG, NACHT'],['quelle_folge_nr','INT','Gefilmt in Folge'],['quelle_szene_id','UUID FK','Quell-Szene','scene_identities'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'stockshot_templates', g:'core', f:[['id','UUID PK','Template-ID'],['produktion_id','TEXT','Staffel'],['kategorie','TEXT','ortswechsel|zeit_vergeht|stimmungswechsel'],['name','TEXT','Template-Name'],['oneliner_vorlage','TEXT','Text mit {motiv}/{stimmung}'],['sortierung','INT','Reihenfolge'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'characters', g:'char', f:[['id','UUID PK','Globale Charakter-ID'],['name','TEXT','z.B. Ben Lohmann'],['meta_json','JSONB','Erweiterte Daten'],['created_at','TSTZ','Erstellt']]},
    { id:'character_productions', g:'char', f:[['character_id','UUID FK','Charakter','characters'],['produktion_id','TEXT FK','Produktion','produktionen'],['rollen_nummer','INT','Rollenblatt-Nr.'],['komparsen_nummer','INT','Komparsen-Nr.'],['kategorie_id','INT FK','Kategorie','character_kategorien'],['updated_at','TSTZ','Aktualisiert'],['is_active','BOOL','Aktiv?'],['darsteller_name','TEXT','Schauspieler-Name']]},
    { id:'character_kategorien', g:'char', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','z.B. Hauptrolle'],['typ','TEXT','rolle|komparse'],['sort_order','INT','Reihenfolge']]},
    { id:'scene_characters', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Charakter','characters'],['kategorie_id','INT FK','Kategorie','character_kategorien'],['anzahl','INT','Bei Gruppen'],['ist_gruppe','BOOL','Gruppen-Eintrag?'],['scene_identity_id','UUID FK','Szene (stabil)','scene_identities'],['spiel_typ','TEXT','o.t.|spiel|text'],['repliken_anzahl','INT','Anzahl Repliken'],['header_o_t','BOOL','Im Header als o.T.'],['werkstufe_id','UUID FK','Werkstufe','werkstufen']]},
    { id:'charakter_beziehungen', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Quell-Charakter','characters'],['related_character_id','UUID FK','Ziel-Charakter','characters'],['beziehungstyp','TEXT','parent|spouse|...'],['label','TEXT','Freies Label']]},
    { id:'charakter_fotos', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Charakter','characters'],['dateiname','TEXT','Server-Dateiname'],['originalname','TEXT','Upload-Name'],['label','TEXT','Beschriftung'],['sort_order','INT','Reihenfolge'],['ist_primaer','BOOL','Primaerfoto?'],['hochgeladen_am','TSTZ','Upload-Datum'],['media_typ','TEXT','image|video'],['thumbnail_dateiname','TEXT','Thumbnail']]},
    { id:'charakter_felder_config', g:'char', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Feldname'],['typ','TEXT','text|richtext|select|ref'],['optionen','JSONB','Select-Optionen'],['sort_order','INT','Reihenfolge'],['gilt_fuer','TEXT','alle|rolle|komparse']]},
    { id:'charakter_feldwerte', g:'char', f:[['id','SERIAL PK','Interne ID'],['character_id','UUID FK','Charakter','characters'],['motiv_id','UUID FK','Motiv','motive'],['feld_id','INT FK','Feld-Config','charakter_felder_config'],['wert_text','TEXT','Text-Wert'],['wert_json','JSONB','Rich-Text/Struktur']]},
    { id:'charakter_feld_links', g:'char', f:[['id','SERIAL PK','Interne ID'],['source_character_id','UUID FK','Quell-Charakter','characters'],['feld_id','INT FK','Feld-Config','charakter_felder_config'],['linked_character_id','UUID FK','Ziel-Charakter','characters'],['created_at','TSTZ','Erstellt']]},
    { id:'drehorte', g:'motiv', f:[['id','UUID PK','Drehort-ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['label','TEXT','z.B. Stu. 01'],['sort_order','INT','Reihenfolge'],['created_at','TSTZ','Erstellt']]},
    { id:'motive', g:'motiv', f:[['id','UUID PK','Motiv-ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['motiv_nummer','TEXT','z.B. M01'],['name','TEXT','Motivname'],['typ','TEXT','interior|exterior'],['meta_json','JSONB','Metadaten'],['created_at','TSTZ','Erstellt'],['drehort_id','UUID FK','Phys. Drehort','drehorte'],['parent_id','UUID FK','Hauptmotiv','motive']]},
    { id:'motiv_fotos', g:'motiv', f:[['id','SERIAL PK','Interne ID'],['motiv_id','UUID FK','Motiv','motive'],['dateiname','TEXT','Server-Dateiname'],['originalname','TEXT','Upload-Name'],['label','TEXT','Beschriftung'],['sort_order','INT','Reihenfolge'],['ist_primaer','BOOL','Primaerfoto?'],['hochgeladen_am','TSTZ','Upload-Datum'],['media_typ','TEXT','image|video'],['thumbnail_dateiname','TEXT','Thumbnail']]},
    { id:'szenen_revisionen', g:'rev', f:[['id','SERIAL PK','Interne ID'],['dokument_szene_id','UUID FK NOT NULL','Szene','dokument_szenen'],['field_type','TEXT','header|content_block'],['field_name','TEXT','ort_name, spieltag...'],['block_index','INT','Content-Block-Idx'],['block_type','TEXT','action|dialogue|...'],['speaker','TEXT','Sprecher'],['old_value','TEXT','Vorheriger Wert'],['new_value','TEXT','Neuer Wert'],['created_at','TSTZ','Aenderungszeitpunkt']]},
    { id:'szenen_vorstopp', g:'rev', f:[['id','SERIAL PK','Interne ID'],['scene_identity_id','UUID FK','Szene (stabil)','scene_identities'],['stage','TEXT','drehbuch|vorber.|dreh|schnitt'],['user_id','TEXT','Wer hat gemessen'],['user_name','TEXT','Anzeigename'],['dauer_sekunden','INT','Gemessene Zeit'],['methode','TEXT','manuell|auto_*'],['created_at','TSTZ','Erstellt'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'vorstopp_einstellungen', g:'rev', f:[['produktion_id','TEXT PK/FK','Produktion','produktionen'],['methode','TEXT','seiten|zeichen|woerter'],['menge','NUMERIC','Einheiten/Dauer'],['dauer_sekunden','INT','Sek/Mengeneinheit'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'stage_labels', g:'rev', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Label-Name'],['sort_order','INT','Reihenfolge'],['is_produktionsfassung','BOOL','Produktionsfassung?']]},
    { id:'revision_colors', g:'rev', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','z.B. Blaue Seiten'],['color','TEXT','Hex (#4A90D9)'],['sort_order','INT','Reihenfolge']]},
    { id:'revision_export_einstellungen', g:'rev', f:[['produktion_id','TEXT PK/FK','Produktion','produktionen'],['memo_schwellwert_zeichen','INT','Memo-Schwelle (100)'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'dokument_colab_gruppen', g:'collab', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Gruppenname'],['typ','TEXT','colab|produktion'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'dokument_colab_gruppe_mitglieder', g:'collab', f:[['gruppe_id','INT FK','Gruppe','dokument_colab_gruppen'],['user_id','TEXT','Benutzer-ID'],['user_name','TEXT','Anzeigename']]},
    { id:'dokument_benachrichtigungen', g:'collab', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['ereignis','TEXT','version_submitted|...'],['empfaenger_user_ids','TEXT[]','Empfaenger'],['aktiv','BOOL','An/Aus']]},
    { id:'dokument_typ_definitionen', g:'collab', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','z.B. Drehbuch'],['editor_modus','TEXT','screenplay|richtext'],['sort_order','INT','Reihenfolge'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'editor_format_templates', g:'editor', f:[['id','SERIAL PK','Interne ID'],['name','TEXT','z.B. Final Draft Std.'],['ist_standard','BOOL','Default?'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt']]},
    { id:'editor_format_elemente', g:'editor', f:[['id','SERIAL PK','Interne ID'],['template_id','INT FK','Template','editor_format_templates'],['element_typ','TEXT','scene_heading|action|...'],['einrueckung_links','INT','Einrueckung L (%)'],['einrueckung_rechts','INT','Einrueckung R (%)'],['ausrichtung','TEXT','left|center|right'],['grossbuchstaben','BOOL','Uppercase?'],['tab_folge_element','TEXT','Tab -> naechstes'],['enter_folge_element','TEXT','Enter -> naechstes'],['sort_order','INT','Reihenfolge']]},
    { id:'episode_locks', g:'lock', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['folge_nummer','INT','Gesperrte Folge'],['user_id','TEXT','Wer hat gesperrt'],['user_name','TEXT','Anzeigename'],['lock_type','TEXT','exclusive|contract'],['expires_at','TSTZ','Ablauf'],['contract_ref','TEXT','Vertragsreferenz'],['created_at','TSTZ','Erstellt']]},
    { id:'entities', g:'lock', f:[['id','SERIAL PK','Interne ID'],['entity_type','TEXT','charakter|prop|location'],['external_id','TEXT','ID in externer App'],['external_app','TEXT','z.B. kostuem-app'],['name','TEXT','Anzeigename'],['meta_json','JSONB','Metadaten'],['produktion_id','TEXT FK','Produktion','produktionen'],['created_at','TSTZ','Erstellt']]},
    { id:'export_logs', g:'lock', f:[['id','UUID PK','Export-ID'],['user_id','TEXT','Exportierer'],['user_name','TEXT','Anzeigename'],['stage_label','TEXT','Fassungs-Label'],['staffel_id','TEXT','Produktions-ID (Legacy)'],['werkstufe_id','UUID FK','Werkstufe','werkstufen'],['format','TEXT','fountain|fdx|pdf'],['exported_at','TSTZ','Exportzeitpunkt']]},
    { id:'statistik_vorlagen', g:'stat', f:[['id','SERIAL PK','Interne ID'],['produktion_id','TEXT FK','Produktion','produktionen'],['name','TEXT','Vorlagen-Name'],['abfrage_typ','TEXT','character-repliken|...'],['parameter','JSONB','Filter-Parameter'],['erstellt_von','TEXT','Ersteller'],['erstellt_am','TSTZ','Erstellt'],['sortierung','INT','Reihenfolge']]},
    { id:'app_settings', g:'settings', f:[['key','TEXT PK','Einstellungs-Key'],['value','TEXT','Wert'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'user_settings', g:'settings', f:[['user_id','TEXT PK','Benutzer-ID'],['selected_production_id','UUID','Letzte Produktion'],['updated_at','TSTZ','Aktualisiert'],['ui_settings','JSONB','Theme, Sidebar...']]},
    { id:'production_app_settings', g:'settings', f:[['id','SERIAL PK','Interne ID'],['production_id','TEXT','Produktion'],['key','TEXT','Einstellungs-Key'],['value','TEXT','Wert'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'ki_settings', g:'settings', f:[['id','SERIAL PK','Interne ID'],['funktion','TEXT UNIQUE','scene_summary|...'],['provider','TEXT','ollama|mistral|openai'],['model_name','TEXT','z.B. llama3.2'],['enabled','BOOL','An/Aus'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'ki_providers', g:'settings', f:[['provider','TEXT PK','Provider-Name'],['api_key','TEXT','API-Schluessel'],['is_active','BOOL','Aktiv?'],['dsgvo_level','TEXT','gruen|orange|rot'],['tokens_in','BIGINT','Verbrauch IN'],['tokens_out','BIGINT','Verbrauch OUT'],['cost_eur','NUMERIC','Kosten EUR'],['updated_at','TSTZ','Aktualisiert']]},
    { id:'dk_settings_access', g:'settings', f:[['id','SERIAL PK','Interne ID'],['production_id','TEXT','Produktion'],['access_type','TEXT','rolle|user'],['identifier','TEXT','Rollenname/user_id'],['created_at','TSTZ','Erstellt'],['created_by','TEXT','Ersteller']]},
    { id:'scene_comment_events', g:'comment', f:[['id','SERIAL PK','Interne ID'],['scene_id','INT','Szenen-ID'],['messenger_annotation_id','TEXT UNIQUE','Messenger UUID'],['created_at','TSTZ','Erstellt'],['deleted_at','TSTZ','Soft-Delete']]},
    { id:'scene_comment_read_state', g:'comment', f:[['scene_id','INT PK','Szenen-ID'],['user_id','TEXT PK','Benutzer-ID'],['last_read_at','TSTZ','Letzter Lesezeitpunkt']]},
    { id:'schema_migrations', g:'system', f:[['name','TEXT PK','Migrations-Dateiname'],['applied_at','TSTZ','Ausfuehrungszeitpunkt']]},
  ]

  // Column assignments: [x_offset, table_ids[]]
  const cols: [number, string[]][] = [
    [20, ['charakter_beziehungen','charakter_fotos','charakter_feld_links']],
    [380, ['characters','character_productions','character_kategorien','charakter_felder_config','charakter_feldwerte']],
    [740, ['dokument_colab_gruppen','dokument_colab_gruppe_mitglieder','dokument_benachrichtigungen','dokument_typ_definitionen','episode_locks','scene_characters']],
    [1100, ['produktionen','folgen','scene_identities','werkstufen','dokument_szenen','wechselschnitt_partner','stockshot_archiv','stockshot_templates','export_logs']],
    [1460, ['entities','statistik_vorlagen','stage_labels','revision_colors','revision_export_einstellungen','vorstopp_einstellungen','szenen_vorstopp','szenen_revisionen']],
    [1820, ['drehorte','motive','motiv_fotos']],
    [2180, ['editor_format_templates','editor_format_elemente','app_settings','user_settings','production_app_settings','ki_settings','ki_providers','dk_settings_access','scene_comment_events','scene_comment_read_state','schema_migrations']],
  ]

  // Build table map + compute positions
  const tMap = new Map(defs.map(t => [t.id, t]))
  const tH = (t: T) => HH + t.f.length * FH
  const pos: Record<string, { x: number; y: number }> = {}
  const placed = new Set<string>()
  for (const [cx, ids] of cols) {
    let y = 20
    for (const id of ids) {
      if (placed.has(id)) continue
      const t = tMap.get(id)
      if (!t) continue
      pos[id] = { x: cx, y }
      placed.add(id)
      y += tH(t) + GAP
    }
  }

  // Collect FK edges with field-level positions
  const fkEdges: { fromId: string; toId: string; fromFi: number; sx: number; sy: number; tx: number; ty: number }[] = []
  for (const t of defs) {
    const p = pos[t.id]
    if (!p) continue
    t.f.forEach((f, fi) => {
      if (!f[3]) return
      const targetId = f[3]
      const target = tMap.get(targetId)
      const tp = pos[targetId]
      if (!target || !tp) return
      const sy = p.y + HH + fi * FH + FH / 2
      const ty = tp.y + HH + FH / 2 // always point to PK (first field)
      const goRight = p.x < tp.x || (p.x === tp.x && p.y < tp.y)
      const sx = goRight ? p.x + TW : p.x
      const tx2 = goRight ? tp.x : tp.x + TW
      fkEdges.push({ fromId: t.id, toId: targetId, fromFi: fi, sx, sy, tx: tx2, ty })
    })
  }

  // Channel-Offset-Spreading: group edges by column pair, assign spread index
  const SPREAD = 6
  const edgeChannelKey = (e: typeof fkEdges[0]) => `${Math.round(e.sx)}-${Math.round(e.tx)}`
  const edgesByChannel = new Map<string, typeof fkEdges>()
  for (const e of fkEdges) {
    const key = edgeChannelKey(e)
    if (!edgesByChannel.has(key)) edgesByChannel.set(key, [])
    edgesByChannel.get(key)!.push(e)
  }
  const edgeSpreadIdx = new Map<typeof fkEdges[0], number>()
  const edgeSpreadCount = new Map<typeof fkEdges[0], number>()
  for (const [, group] of edgesByChannel) {
    group.forEach((e, i) => {
      edgeSpreadIdx.set(e, i)
      edgeSpreadCount.set(e, group.length)
    })
  }

  // Manhattan routing: H → V → H with channel spreading
  function route(e: typeof fkEdges[0]): string {
    const { sx, sy, tx, ty, fromId, toId } = e
    const idx = edgeSpreadIdx.get(e) ?? 0
    const count = edgeSpreadCount.get(e) ?? 1
    const offset = (idx - (count - 1) / 2) * SPREAD

    const sameCol = Math.abs(sx - tx) < TW
    if (sameCol && fromId === toId) {
      // Self-reference (e.g. motive → motive)
      const ox = Math.max(sx, tx) + 30 + offset
      return `M ${sx},${sy} H ${ox} V ${ty} H ${tx}`
    }
    if (Math.abs(sx - tx) < 5) {
      // Same X edge — offset through side
      const ox = sx + (sx > 1000 ? 25 : -25) + offset
      return `M ${sx},${sy} H ${ox} V ${ty} H ${tx}`
    }
    const midX = sx + (tx - sx) * 0.5 + offset
    return `M ${sx},${sy} H ${midX} V ${ty} H ${tx}`
  }

  const groupColors: Record<string, string> = {
    core: '#007AFF', char: '#FF9500', motiv: '#00C853', rev: '#FF3B30',
    collab: '#AF52DE', editor: '#8E8E93', settings: '#8E8E93', lock: '#FF3B30',
    stat: '#FF9500', comment: '#FFCC00', system: '#8E8E93',
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    setZoom(z => Math.min(2.5, Math.max(0.15, z + delta)))
  }
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) { setDragging(true); setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y }) }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  const handleMouseUp = () => setDragging(false)

  // Canvas size
  const canvasW = 2550, canvasH = 1400

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5 }}>
          ER-DIAGRAMM — 42 TABELLEN, 43 FK-BEZIEHUNGEN
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>+</button>
          <span style={{ fontSize: 10, color: C.muted, minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.max(0.15, z - 0.15))} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>-</button>
          <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(0.42) }} style={{ height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', fontSize: 10, padding: '0 8px' }}>Reset</button>
        </div>
      </div>
      <div
        style={{
          width: '100%', height: 600, overflow: 'hidden',
          border: `1px solid ${C.border}`, borderRadius: 12, background: '#fdfdfd',
          cursor: dragging ? 'grabbing' : 'grab', position: 'relative', userSelect: 'none',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <svg width="100%" height="100%" style={{ display: 'block' }}
          viewBox={`${-pan.x / zoom} ${-pan.y / zoom} ${canvasW / zoom} ${600 / zoom}`}
        >
          <defs>
            <marker id="fk-arrow" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto">
              <polygon points="0 0, 7 2.5, 0 5" fill="#999" />
            </marker>
          </defs>

          {/* FK Connection Lines */}
          {fkEdges.map((e, i) => {
            const isHighlight = hovered === e.fromId || hovered === e.toId
            const dimmed = hovered != null && !isHighlight
            const gColor = groupColors[tMap.get(e.fromId)?.g ?? ''] || '#999'
            return <path key={`e${i}`} d={route(e)}
              fill="none"
              stroke={isHighlight ? '#007AFF' : gColor}
              strokeWidth={isHighlight ? 2 : 1}
              opacity={dimmed ? 0.08 : isHighlight ? 1 : 0.45}
              markerEnd="url(#fk-arrow)"
              style={{ transition: 'stroke 0.15s, opacity 0.15s, stroke-width 0.15s' }} />
          })}

          {/* Table Cards */}
          {defs.map(t => {
            const p = pos[t.id]
            if (!p) return null
            const color = groupColors[t.g] || '#8E8E93'
            const h = tH(t)
            const isHov = hovered === t.id
            return (
              <g key={t.id} onMouseEnter={() => setHovered(t.id)} onMouseLeave={() => setHovered(null)}>
                {/* Shadow */}
                <rect x={p.x + 1} y={p.y + 1} width={TW} height={h} rx={5} fill="#00000008" />
                {/* Card bg */}
                <rect x={p.x} y={p.y} width={TW} height={h} rx={5}
                  fill="#fff" stroke={isHov ? color : '#ddd'} strokeWidth={isHov ? 2 : 1} />
                {/* Header */}
                <rect x={p.x} y={p.y} width={TW} height={HH} rx={5} fill={color} />
                <rect x={p.x} y={p.y + HH - 5} width={TW} height={5} fill={color} />
                <text x={p.x + 8} y={p.y + 16} fontSize={10} fontWeight={700} fontFamily="monospace" fill="#fff">
                  {t.id}
                </text>
                <text x={p.x + TW - 8} y={p.y + 16} fontSize={8} fontWeight={500} fill="#ffffff99" textAnchor="end">
                  {t.f.length}
                </text>
                {/* Fields */}
                {t.f.map((f, fi) => {
                  const fy = p.y + HH + fi * FH
                  const isFK = !!f[3]
                  const isPK = f[1].includes('PK')
                  return (
                    <g key={fi}>
                      {fi % 2 === 1 && <rect x={p.x} y={fy} width={TW} height={FH} fill="#f8f8f8" />}
                      {/* PK/FK indicator */}
                      {isPK && <text x={p.x + 3} y={fy + 12} fontSize={7} fill={color} fontWeight={700}>PK</text>}
                      {isFK && !isPK && <text x={p.x + 3} y={fy + 12} fontSize={7} fill="#999" fontWeight={600}>FK</text>}
                      {/* Field name */}
                      <text x={p.x + 22} y={fy + 12} fontSize={8.5} fontWeight={isFK || isPK ? 600 : 400}
                        fontFamily="monospace" fill={isFK ? '#555' : '#333'}
                        clipPath={`inset(0 ${TW - 115}px 0 0)`}>
                        {f[0].length > 14 ? f[0].slice(0, 13) + '..' : f[0]}
                      </text>
                      {/* Type */}
                      <text x={p.x + 120} y={fy + 12} fontSize={7.5} fontFamily="monospace" fill="#999">
                        {f[1].replace(' NOT NULL', '!').length > 12 ? f[1].slice(0, 11) + '..' : f[1].replace(' NOT NULL', '!')}
                      </text>
                      {/* Description */}
                      <text x={p.x + 195} y={fy + 12} fontSize={7.5} fill="#aaa">
                        {f[2].length > 20 ? f[2].slice(0, 19) + '..' : f[2]}
                      </text>
                    </g>
                  )
                })}
                {/* Bottom border */}
                <rect x={p.x} y={p.y + h - 1} width={TW} height={1} fill="#eee" />
              </g>
            )
          })}
        </svg>
        {/* Hover tooltip */}
        {hovered && (
          <div style={{
            position: 'absolute', top: 8, right: 8, background: '#111', color: '#fff',
            fontSize: 11, padding: '6px 10px', borderRadius: 6, pointerEvents: 'none', maxWidth: 260,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{hovered}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>
              {tMap.get(hovered)?.f.length} Felder
              {fkEdges.filter(e => e.fromId === hovered).length > 0 && ` · ${fkEdges.filter(e => e.fromId === hovered).length} FK`}
              {fkEdges.filter(e => e.toId === hovered).length > 0 && ` · ${fkEdges.filter(e => e.toId === hovered).length} referenziert`}
            </div>
          </div>
        )}
        <div style={{ position: 'absolute', bottom: 8, left: 8, fontSize: 9, color: C.muted, background: '#fdfdfdcc', padding: '2px 6px', borderRadius: 4 }}>
          Scrollen = Zoom · Ziehen = Verschieben · Hover = Beziehungen hervorheben
        </div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
        {[
          { label: 'Kern (5)', color: '#007AFF' },
          { label: 'Characters (9)', color: '#FF9500' },
          { label: 'Motive (3)', color: '#00C853' },
          { label: 'Revision (6)', color: '#FF3B30' },
          { label: 'Kollaboration (4)', color: '#AF52DE' },
          { label: 'Locks/Export (3)', color: '#FF3B30' },
          { label: 'Statistik (1)', color: '#FF9500' },
          { label: 'Settings (6)', color: '#8E8E93' },
          { label: 'Editor (2)', color: '#8E8E93' },
          { label: 'Kommentare (2)', color: '#FFCC00' },
          { label: 'System (1)', color: '#8E8E93' },
        ].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color + '30', border: `1px solid ${l.color}` }} />
            <span style={{ color: C.muted }}>{l.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function DatenmodellTab() {
  const [expandedGroup, setExpandedGroup] = useState<string | null>('core')

  const toggle = (id: string) => setExpandedGroup(expandedGroup === id ? null : id)

  const GroupHeader = ({ id, title, count, color }: { id: string; title: string; count: number; color: string }) => (
    <button
      onClick={() => toggle(id)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', border: `1px solid ${color}44`, borderRadius: 10,
        background: expandedGroup === id ? color + '12' : C.surface,
        cursor: 'pointer', textAlign: 'left', marginBottom: expandedGroup === id ? 0 : 8,
        borderBottomLeftRadius: expandedGroup === id ? 0 : 10,
        borderBottomRightRadius: expandedGroup === id ? 0 : 10,
      }}
    >
      <span style={{ fontSize: 16, transition: 'transform 0.15s', transform: expandedGroup === id ? 'rotate(90deg)' : 'rotate(0)' }}>&#9654;</span>
      <span style={{ fontWeight: 700, fontSize: 13, color: C.text, flex: 1 }}>{title}</span>
      <Badge color={color}>{count} Tabellen</Badge>
    </button>
  )

  const GroupBody = ({ id, children }: { id: string; children: React.ReactNode }) => {
    if (expandedGroup !== id) return null
    return (
      <div style={{
        border: `1px solid ${C.border}`, borderTop: 'none',
        borderRadius: '0 0 10px 10px', padding: 20,
        marginBottom: 8, background: C.surface,
      }}>
        {children}
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px 0' }}>Datenmodell — Script-App</h2>
        <p style={{ color: C.muted, fontSize: 13, margin: '0 0 4px 0' }}>
          PostgreSQL <code>script_db</code> — 51 Migrationen (v1–v51), 42 aktive Tabellen in 7 Gruppen.
        </p>
        <p style={{ color: C.muted, fontSize: 12, margin: '0 0 16px 0', lineHeight: 1.6 }}>
          <strong style={{ color: C.text }}>v51 (2026-05-04):</strong> Alle Legacy-Tabellen (szenen, stages, folgen_dokumente, folgen_dokument_fassungen,
          szenen_versionen, kommentare, annotationen, autoren, audit) wurden endgueltig <code>DROP TABLE</code> entfernt.
          Das Datenmodell besteht jetzt ausschliesslich aus dem neuen 5-Tabellen-Kern:
          <code> produktionen → folgen → werkstufen + scene_identities → dokument_szenen</code>.
        </p>

        {/* Interactive Network Diagram */}
        <NetzplanDiagram />

        {/* ER Overview Diagram (compact) */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: 20, overflowX: 'auto', marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 12, letterSpacing: 0.5 }}>
            ER-UEBERSICHT — KERNBEZIEHUNGEN
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 700 }}>
            <div style={{ border: `2px solid ${C.blue}`, borderRadius: 8, padding: '8px 12px', background: C.blue + '0a', minWidth: 100, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.blue }}>produktionen</div>
              <div style={{ fontSize: 9, color: C.muted }}>Produktion (Hub)</div>
            </div>
            <div style={{ alignSelf: 'center', color: C.muted, fontSize: 11, lineHeight: 1 }}>1:n</div>
            <div style={{ border: `2px solid ${C.purple}`, borderRadius: 8, padding: '8px 12px', background: C.purple + '0a', minWidth: 80, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.purple }}>folgen</div>
              <div style={{ fontSize: 9, color: C.muted }}>Episode</div>
            </div>
            <div style={{ alignSelf: 'center', color: C.muted, fontSize: 11 }}>1:n</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ border: `2px solid ${C.orange}`, borderRadius: 8, padding: '6px 10px', background: C.orange + '0a', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.orange }}>werkstufen</div>
                <div style={{ fontSize: 9, color: C.muted }}>Typ + Version</div>
              </div>
              <div style={{ border: `2px solid ${C.blue}`, borderRadius: 8, padding: '6px 10px', background: C.blue + '0a', textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: C.blue }}>scene_identities</div>
                <div style={{ fontSize: 9, color: C.muted }}>Stabile UUID</div>
              </div>
            </div>
            <div style={{ alignSelf: 'center', color: C.muted, fontSize: 11 }}>N:M</div>
            <div style={{ border: `2px solid ${C.green}`, borderRadius: 8, padding: '8px 12px', background: C.green + '0a', minWidth: 110, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.green }}>dokument_szenen</div>
              <div style={{ fontSize: 9, color: C.muted }}>Content (N:M)</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16, paddingTop: 12, borderTop: `1px dashed ${C.border}` }}>
            <span style={{ fontSize: 10, color: C.muted }}>42 Tabellen, 43 FK-Beziehungen, 0 Legacy-Tabellen</span>
          </div>
        </div>
      </div>

      {/* ── Gruppe 1: Kern ── */}
      <GroupHeader id="core" title="1. Kern — Produktion, Folgen, Werkstufen, Szenen" count={5} color={C.blue} />
      <GroupBody id="core">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TableCard title="produktionen" color={C.blue} note="Produktion (v47: umbenannt von staffeln)" fields={[
            { name: 'id', type: 'TEXT PK', desc: 'UUID aus Produktionsdatenbank' },
            { name: 'titel', type: 'TEXT', desc: 'Anzeigename (z.B. "Rote Rosen Staffel 25")' },
            { name: 'produktion_db_id', type: 'UUID', desc: 'FK zur Produktionsdatenbank' },
            { name: 'seitenformat', type: 'TEXT', desc: 'a4 (default) — globale Seitenformat-Einstellung' },
            { name: 'meta_json', type: 'JSONB', desc: 'Erweiterbare Metadaten (staffelnummer, projektnummer)' },
          ]} />
          <TableCard title="folgen" color={C.purple} note="Episode (v43 Merge, v47: meta_json entfernt)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interner Episoden-Key' },
            { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            { name: 'folge_nummer', type: 'INT', desc: 'Episodennummer (UNIQUE mit produktion_id)' },
            { name: 'folgen_titel', type: 'TEXT', desc: 'Arbeitstitel' },
            { name: 'air_date', type: 'DATE', desc: 'Sendedatum' },
            { name: 'synopsis', type: 'TEXT', desc: 'Episoden-Synopsis' },
            { name: 'produktion_db_id', type: 'UUID', desc: 'Direkter Link zur Produktionsdatenbank' },
            { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
            { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
          ]} />
          <TableCard title="scene_identities" color={C.blue} note="Stabile Szenen-UUID (v47: produktion_id entfernt — via folge_id ableitbar)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Global stabile Szenen-ID' },
            { name: 'folge_id', type: 'INT FK', desc: '-> folgen.id' },
            { name: 'created_by', type: 'TEXT', desc: 'Ersteller' },
            { name: 'created_at', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
          ]} />
          <TableCard title="werkstufen" color={C.orange} note="Dokument-Version auf Folgen-Ebene (ersetzt folgen_dokument_fassungen)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Werkstufen-ID' },
            { name: 'folge_id', type: 'INT FK', desc: '-> folgen.id' },
            { name: 'typ', type: 'TEXT', desc: 'drehbuch | storyline | notiz | abstrakt | custom' },
            { name: 'version_nummer', type: 'INT', desc: 'Versionszaehler (1, 2, 3...)' },
            { name: 'label', type: 'TEXT', desc: 'z.B. "Blaue Seiten", "Drehfassung"' },
            { name: 'sichtbarkeit', type: 'TEXT', desc: 'privat | team | alle' },
            { name: 'abgegeben', type: 'BOOL', desc: 'Eingefroren? (HTTP 409 bei Schreibversuch)' },
            { name: 'bearbeitung_status', type: 'TEXT', desc: 'entwurf | in_review | approved' },
            { name: 'stand_datum', type: 'DATE', desc: '"Stand"-Datum vom PDF-Cover' },
            { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
            { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
          ]} />
          <TableCard title="dokument_szenen" color={C.green} note="Kreuzungstabelle: Content pro Szene pro Werkstufe (N:M)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Eindeutige Szenen-Instanz' },
            { name: 'werkstufe_id', type: 'UUID FK', desc: '-> werkstufen.id' },
            { name: 'scene_identity_id', type: 'UUID FK', desc: '-> scene_identities.id' },
            { name: 'sort_order', type: 'INT', desc: 'Reihenfolge in dieser Werkstufe' },
            { name: 'scene_nummer', type: 'INT', desc: 'Angezeigte Szenennummer' },
            { name: 'scene_nummer_suffix', type: 'VARCHAR', desc: 'z.B. "a", "b" (WGA-Suffix)' },
            { name: 'ort_name', type: 'TEXT', desc: 'Motivname' },
            { name: 'int_ext', type: 'TEXT', desc: 'INT | EXT | INT/EXT' },
            { name: 'tageszeit', type: 'TEXT', desc: 'TAG | NACHT | ABEND | DAEMMERUNG' },
            { name: 'spieltag', type: 'INT', desc: 'Drehtag-Index' },
            { name: 'spielzeit', type: 'TEXT', desc: 'Spielzeit-Info (z.B. "Morgens")' },
            { name: 'zusammenfassung', type: 'TEXT', desc: 'Kurzbeschreibung' },
            { name: 'szeneninfo', type: 'TEXT', desc: 'Redaktionelle Hinweise (z.B. Block-Zuordnung)' },
            { name: 'seiten', type: 'TEXT', desc: 'Seitenzahl (z.B. "2 5/8")' },
            { name: 'dauer_min', type: 'INT', desc: 'Dauer Minuten (Legacy-Feld)' },
            { name: 'dauer_sek', type: 'INT', desc: 'Dauer Sekunden (Legacy-Feld)' },
            { name: 'content', type: 'JSONB', desc: 'ProseMirror/Screenplay JSON (einzige Content-Quelle!)' },
            { name: 'format', type: 'TEXT', desc: 'drehbuch | storyline | notiz (bestimmt Editor-Typ)' },
            { name: 'stoppzeit_sek', type: 'INT', desc: 'Spieldauer in Sekunden (270 = "04:30")' },
            { name: 'geloescht', type: 'BOOL', desc: 'Soft-Delete (bleibt fuer Diff)' },
            { name: 'is_wechselschnitt', type: 'BOOL', desc: 'Legacy WS-Flag' },
            { name: 'sondertyp', type: 'TEXT', desc: "NULL | 'wechselschnitt' | 'stockshot' | 'flashback'" },
            { name: 'stockshot_kategorie', type: 'TEXT', desc: "'ortswechsel' | 'zeit_vergeht' | 'stimmungswechsel'" },
            { name: 'stockshot_stimmung', type: 'TEXT', desc: 'Stimmungswert (z.B. NACHT)' },
            { name: 'stockshot_neu_drehen', type: 'BOOL', desc: 'Muss neu gefilmt werden' },
            { name: 'flashback_referenz_id', type: 'UUID FK', desc: 'Ursprungsszene (scene_identities)' },
            { name: 'yjs_state', type: 'BYTEA', desc: 'Yjs Binary State (Echtzeit-Kollaboration)' },
            { name: 'updated_by', type: 'TEXT', desc: 'Letzter Bearbeiter (user_id)' },
            { name: 'updated_at', type: 'TSTZ', desc: 'Letzte Aenderung' },
          ]} />
          <InfoBox title="UNIQUE(werkstufe_id, scene_identity_id)" color={C.blue}>
            Pro Szene und Werkstufe genau ein Eintrag. Eine Szene existiert in mehreren Werkstufen — N:M aufgeloest durch <code>dokument_szenen</code>.
          </InfoBox>
        </div>
      </GroupBody>

      {/* ── Gruppe 2: Characters & Motive ── */}
      <GroupHeader id="characters" title="2. Characters, Motive, Statistik & Fotos" count={11} color={C.orange} />
      <GroupBody id="characters">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="characters" color={C.blue} note="Globaler Charakter (produktionsuebergreifend)" fields={[
              { name: 'id', type: 'UUID PK', desc: 'Globale Charakter-ID' },
              { name: 'name', type: 'TEXT', desc: 'z.B. "Ben Lohmann"' },
              { name: 'meta_json', type: 'JSONB', desc: 'Erweiterte Daten' },
            ]} />
            <TableCard title="character_productions" color={C.purple} note="Produktionsspezifische Nummer + Darsteller" fields={[
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'rollen_nummer', type: 'INT', desc: 'Rollenblatt-Nr. (UNIQUE pro Staffel)' },
              { name: 'komparsen_nummer', type: 'INT', desc: 'Komparsen-Nr. (UNIQUE pro Staffel)' },
              { name: 'kategorie_id', type: 'INT FK', desc: '-> character_kategorien.id' },
              { name: 'darsteller_name', type: 'TEXT', desc: 'Schauspieler-Name (v48, fuer Statistik-Reports)' },
              { name: 'is_active', type: 'BOOL', desc: 'Aktiv-Flag' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="character_kategorien" color={C.gray} note="Besetzungs-Kategorie pro Staffel" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'z.B. Hauptrolle, Episoden-Rolle' },
              { name: 'typ', type: 'TEXT', desc: 'rolle | komparse' },
              { name: 'sort_order', type: 'INT', desc: 'Anzeigereihenfolge' },
            ]} />
            <TableCard title="scene_characters" color={C.orange} note="Welche Charaktere in welcher Szene (v45: Komparsen-Spiel, v46: werkstufe_id)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'scene_identity_id', type: 'UUID FK', desc: '-> scene_identities.id (stabil!)' },
              { name: 'werkstufe_id', type: 'UUID FK', desc: '-> werkstufen.id (v46, fuer Versionsvergleich)' },
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'kategorie_id', type: 'INT FK', desc: '-> character_kategorien.id' },
              { name: 'anzahl', type: 'INT', desc: 'Bei Komparsen-Gruppen' },
              { name: 'ist_gruppe', type: 'BOOL', desc: 'Gruppen-Eintrag?' },
              { name: 'spiel_typ', type: 'TEXT', desc: 'o.t. | spiel | text (v45, Komparsen-Klassifikation)' },
              { name: 'repliken_anzahl', type: 'INT', desc: 'Anzahl Repliken (v45, auto-gezaehlt)' },
              { name: 'header_o_t', type: 'BOOL', desc: 'Im Szenenkopf als o.T. markiert (v45)' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="charakter_fotos" color={C.blue} note="Fotos & Videos zu Charakteren" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'dateiname', type: 'TEXT', desc: 'Dateiname auf Server' },
              { name: 'ist_primaer', type: 'BOOL', desc: 'Primaerfoto-Flag' },
              { name: 'media_typ', type: 'TEXT', desc: 'image | video' },
              { name: 'thumbnail_dateiname', type: 'TEXT', desc: 'Thumbnail-Dateiname' },
            ]} />
            <TableCard title="charakter_beziehungen" color={C.purple} note="Beziehungen zwischen Charakteren" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'character_id', type: 'UUID FK', desc: 'Quell-Charakter' },
              { name: 'related_character_id', type: 'UUID FK', desc: 'Ziel-Charakter' },
              { name: 'beziehungstyp', type: 'TEXT', desc: 'z.B. parent, spouse, colleague' },
              { name: 'label', type: 'TEXT', desc: 'Freies Label' },
            ]} />
          </div>
          <TableCard title="charakter_felder_config" color={C.gray} note="Custom-Felder pro Staffel (Admin-konfigurierbar)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            { name: 'name', type: 'TEXT', desc: 'Feldname (z.B. "Alter", "Charakter")' },
            { name: 'typ', type: 'TEXT', desc: 'text | richtext | character_ref | select' },
            { name: 'optionen', type: 'JSONB', desc: 'Select-Optionen (bei typ=select)' },
            { name: 'gilt_fuer', type: 'TEXT', desc: 'alle | rolle | komparse | motiv' },
          ]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="charakter_feldwerte" color={C.blue} note="Feldwerte (Characters oder Motive)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'character_id', type: 'UUID FK', desc: '-> characters.id (oder NULL)' },
              { name: 'motiv_id', type: 'UUID FK', desc: '-> motive.id (oder NULL)' },
              { name: 'feld_id', type: 'INT FK', desc: '-> charakter_felder_config.id' },
              { name: 'wert_text', type: 'TEXT', desc: 'Text-Wert' },
              { name: 'wert_json', type: 'JSONB', desc: 'Rich-Text oder strukturierter Wert' },
            ]} />
            <TableCard title="charakter_feld_links" color={C.purple} note="Feld-Referenzen zu anderen Charakteren" fields={[
              { name: 'source_character_id', type: 'UUID FK', desc: '-> characters.id' },
              { name: 'feld_id', type: 'INT FK', desc: '-> charakter_felder_config.id' },
              { name: 'linked_character_id', type: 'UUID FK', desc: '-> characters.id (Ziel)' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="drehorte" color={'#00C853'} note="Physische Drehorte (Stu. 01, Außendreh, ...)" fields={[
              { name: 'id', type: 'UUID PK', desc: 'Drehort-ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'label', type: 'TEXT', desc: 'z.B. "Stu. 01", "Außendreh"' },
              { name: 'sort_order', type: 'INT', desc: 'Reihenfolge' },
            ]} />
            <TableCard title="motive" color={'#00C853'} note="Konzeptionelle Motive mit Hierarchie" fields={[
              { name: 'id', type: 'UUID PK', desc: 'Motiv-ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'drehort_id', type: 'UUID FK', desc: '-> drehorte.id (physischer Ort)' },
              { name: 'parent_id', type: 'UUID FK', desc: '-> motive.id (Hauptmotiv)' },
              { name: 'motiv_nummer', type: 'TEXT', desc: 'z.B. "M01"' },
              { name: 'name', type: 'TEXT', desc: 'Motivname (ohne Drehort-Prefix)' },
              { name: 'typ', type: 'TEXT', desc: 'interior | exterior' },
              { name: 'meta_json', type: 'JSONB', desc: 'Flexible Metadaten' },
            ]} />
            <TableCard title="motiv_fotos" color={'#00C853'} note="Fotos zu Motiven" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'motiv_id', type: 'UUID FK', desc: '-> motive.id' },
              { name: 'dateiname', type: 'TEXT', desc: 'Dateiname' },
              { name: 'ist_primaer', type: 'BOOL', desc: 'Primaerfoto-Flag' },
              { name: 'media_typ', type: 'TEXT', desc: 'image | video' },
            ]} />
          </div>
          <TableCard title="statistik_vorlagen" color={C.orange} note="Gespeicherte Statistik-Abfragen (v46)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            { name: 'name', type: 'TEXT', desc: 'Vorlagen-Name (z.B. "Hauptrollen Block 28")' },
            { name: 'abfrage_typ', type: 'TEXT', desc: 'character-repliken | motiv-auslastung | ...' },
            { name: 'parameter', type: 'JSONB', desc: 'Gespeicherte Filter-Parameter' },
            { name: 'erstellt_von', type: 'TEXT', desc: 'user_id' },
            { name: 'sortierung', type: 'INT', desc: 'Anzeigereihenfolge' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 3: Versionen & Revision ── */}
      <GroupHeader id="versions" title="3. Revision, Vorstopp & Fassungs-Labels" count={5} color={C.red} />
      <GroupBody id="versions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TableCard title="szenen_revisionen" color={C.red} note="Delta-Tracking: Was hat sich geaendert? (NOT NULL dokument_szene_id seit v51)" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'dokument_szene_id', type: 'UUID FK NOT NULL', desc: '-> dokument_szenen.id (pro Werkstufe)' },
            { name: 'field_type', type: 'TEXT', desc: 'header | content_block' },
            { name: 'field_name', type: 'TEXT', desc: 'ort_name, spieltag, etc.' },
            { name: 'block_index', type: 'INT', desc: 'Content-Block-Index' },
            { name: 'block_type', type: 'TEXT', desc: 'action | dialogue | character | ...' },
            { name: 'speaker', type: 'TEXT', desc: 'Sprecher (bei Dialog-Bloecken)' },
            { name: 'old_value', type: 'TEXT', desc: 'Vorheriger Wert' },
            { name: 'new_value', type: 'TEXT', desc: 'Neuer Wert' },
            { name: 'created_at', type: 'TSTZ', desc: 'Aenderungszeitpunkt' },
          ]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="szenen_vorstopp" color={'#00C853'} note="Performance-Zeiten pro Phase" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'scene_identity_id', type: 'UUID FK', desc: '-> scene_identities.id (stabil!)' },
              { name: 'stage', type: 'TEXT', desc: 'drehbuch | vorbereitung | dreh | schnitt' },
              { name: 'user_id', type: 'TEXT', desc: 'Wer hat gemessen' },
              { name: 'dauer_sekunden', type: 'INT', desc: 'Gemessene Zeit in Sekunden' },
              { name: 'methode', type: 'TEXT', desc: 'manuell | auto_seiten | auto_zeichen | auto_woerter' },
            ]} />
            <TableCard title="vorstopp_einstellungen" color={'#00C853'} note="Kalkulations-Parameter pro Staffel" fields={[
              { name: 'produktion_id', type: 'TEXT PK/FK', desc: '-> produktionen.id' },
              { name: 'methode', type: 'TEXT', desc: 'seiten | zeichen | woerter' },
              { name: 'menge', type: 'NUMERIC', desc: 'Einheiten pro Dauer (z.B. 0.125)' },
              { name: 'dauer_sekunden', type: 'INT', desc: 'Sekunden pro Mengeneinheit' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="stage_labels" color={C.orange} note="Fassungs-Labels pro Staffel (z.B. Abstrakt, Endfassung)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'Label-Name' },
              { name: 'is_produktionsfassung', type: 'BOOL', desc: 'Produktionsfassung-Flag' },
            ]} />
            <TableCard title="revision_colors" color={C.orange} note="WGA-Standard Revisionsfarben" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'z.B. Blaue Seiten, Gelbe Seiten' },
              { name: 'color', type: 'TEXT', desc: 'Hex-Farbe (z.B. #4A90D9)' },
            ]} />
          </div>
          <TableCard title="revision_export_einstellungen" color={C.gray} note="Revision-Export Konfiguration" fields={[
            { name: 'produktion_id', type: 'TEXT PK/FK', desc: '-> produktionen.id' },
            { name: 'memo_schwellwert_zeichen', type: 'INT', desc: 'Zeichenschwelle fuer Memo-Seiten (default: 100)' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 4: Kollaboration ── */}
      <GroupHeader id="collab" title="4. Kollaboration & Dokument-System" count={5} color={C.purple} />
      <GroupBody id="collab">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="dokument_colab_gruppen" color={C.purple} note="Kollaborationsgruppen" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'Gruppenname' },
              { name: 'typ', type: 'TEXT', desc: 'colab | produktion' },
              { name: 'erstellt_von', type: 'TEXT', desc: 'Ersteller user_id' },
              { name: 'erstellt_am', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
            ]} />
            <TableCard title="dokument_colab_gruppe_mitglieder" color={C.purple} note="Gruppen-Mitgliedschaft" fields={[
              { name: 'gruppe_id', type: 'INT FK', desc: '-> dokument_colab_gruppen.id' },
              { name: 'user_id', type: 'TEXT', desc: 'Benutzer-ID' },
              { name: 'user_name', type: 'TEXT', desc: 'Anzeigename' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="dokument_benachrichtigungen" color={C.blue} note="Benachrichtigungs-Routing pro Produktion" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'ereignis', type: 'TEXT', desc: 'version_submitted | approved | ...' },
              { name: 'empfaenger_user_ids', type: 'TEXT[]', desc: 'Empfaenger-Liste' },
              { name: 'aktiv', type: 'BOOL', desc: 'An/Aus' },
            ]} />
            <TableCard title="dokument_typ_definitionen" color={C.gray} note="Custom-Dokumenttypen pro Produktion" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'name', type: 'TEXT', desc: 'z.B. Drehbuch, Notizen' },
              { name: 'editor_modus', type: 'TEXT', desc: 'screenplay | richtext' },
              { name: 'sort_order', type: 'INT', desc: 'Anzeigereihenfolge' },
            ]} />
          </div>
          <TableCard title="editor_format_templates + editor_format_elemente" color={C.gray} note="Screenplay-Format-Templates + Regeln pro Element-Typ (7 Typen)" fields={[
            { name: 'templates.id', type: 'SERIAL PK', desc: 'Template-ID' },
            { name: 'templates.name', type: 'TEXT', desc: 'z.B. Final Draft Standard' },
            { name: 'templates.ist_standard', type: 'BOOL', desc: 'Default-Template?' },
            { name: 'elemente.template_id', type: 'INT FK', desc: '-> editor_format_templates.id' },
            { name: 'elemente.element_typ', type: 'TEXT', desc: 'scene_heading | action | character | dialogue | parenthetical | transition | shot' },
            { name: 'elemente.einrueckung_l/r', type: 'INT', desc: 'Zeicheneinrueckung links/rechts' },
            { name: 'elemente.grossbuchstaben', type: 'BOOL', desc: 'Uppercase-Regel' },
            { name: 'elemente.tab_folge', type: 'TEXT', desc: 'Naechstes Element bei Tab' },
            { name: 'elemente.enter_folge', type: 'TEXT', desc: 'Naechstes Element bei Enter' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 5: Kommentare (Messenger-Integration) ── */}
      <GroupHeader id="comments" title="5. Kommentare (Messenger-Integration)" count={2} color={'#FFCC00'} />
      <GroupBody id="comments">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <InfoBox title="Kommentare laufen ueber messenger.app" color={C.blue}>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              Seit v51 gibt es keine lokale Kommentar-Tabelle mehr. Annotationen und Kommentare werden ueber die
              messenger.app verwaltet. Die Script-App speichert nur den Read-State und empfaengt Events via Webhook.
            </div>
          </InfoBox>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="scene_comment_read_state" color={C.blue} note="Gelesen-Status (Messenger-Integration)" fields={[
              { name: 'scene_id', type: 'INT PK', desc: 'Szenen-ID (Composite PK mit user_id)' },
              { name: 'user_id', type: 'TEXT PK', desc: 'Benutzer-ID' },
              { name: 'last_read_at', type: 'TSTZ', desc: 'Letzter Lesezeitpunkt' },
            ]} />
            <TableCard title="scene_comment_events" color={C.blue} note="Messenger-Annotation Projektion (Webhook-Empfang)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'scene_id', type: 'INT', desc: 'Szenen-ID' },
              { name: 'messenger_annotation_id', type: 'TEXT UNIQUE', desc: 'Messenger-Annotation UUID' },
              { name: 'created_at', type: 'TSTZ', desc: 'Erstellungszeitpunkt' },
              { name: 'deleted_at', type: 'TSTZ', desc: 'Soft-Delete' },
            ]} />
          </div>
        </div>
      </GroupBody>

      {/* ── Gruppe 6: Locking & Entities ── */}
      <GroupHeader id="lock" title="6. Locking, Entities & Export" count={3} color={C.red} />
      <GroupBody id="lock">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="episode_locks" color={C.red} note="Folgen-Sperre (alle Werkstufen betroffen)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
              { name: 'folge_nummer', type: 'INT', desc: 'Gesperrte Folge' },
              { name: 'user_id', type: 'TEXT', desc: 'Wer hat gesperrt' },
              { name: 'lock_type', type: 'TEXT', desc: 'exclusive | contract' },
              { name: 'expires_at', type: 'TSTZ', desc: 'Ablaufzeitpunkt' },
              { name: 'contract_ref', type: 'TEXT', desc: 'Vertragsreferenz (bei contract-lock)' },
            ]} />
            <TableCard title="entities" color={C.purple} note="Generische Entitaeten (Props, Fahrzeuge, etc.)" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'entity_type', type: 'TEXT', desc: 'charakter | prop | location | kostuem | fahrzeug' },
              { name: 'external_id', type: 'TEXT', desc: 'ID in externer App' },
              { name: 'external_app', type: 'TEXT', desc: 'Quell-App (z.B. kostuem-app)' },
              { name: 'name', type: 'TEXT', desc: 'Anzeigename' },
              { name: 'produktion_id', type: 'TEXT FK', desc: '-> produktionen.id' },
            ]} />
          </div>
          <TableCard title="export_logs" color={C.gray} note="Export-Protokoll (Wasserzeichen-Audit, v51: werkstufe_id statt stage_id)" fields={[
            { name: 'id', type: 'UUID PK', desc: 'Export-ID' },
            { name: 'user_id', type: 'TEXT', desc: 'Exportierer' },
            { name: 'user_name', type: 'TEXT', desc: 'Anzeigename' },
            { name: 'stage_label', type: 'TEXT', desc: 'Fassungs-Label (z.B. "Drehbuch V2")' },
            { name: 'staffel_id', type: 'TEXT', desc: 'Produktions-ID (Legacy-Feld)' },
            { name: 'werkstufe_id', type: 'UUID FK', desc: '-> werkstufen.id (v51)' },
            { name: 'format', type: 'TEXT', desc: 'fountain | fdx | pdf' },
            { name: 'exported_at', type: 'TSTZ', desc: 'Exportzeitpunkt' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 7: KI & Einstellungen ── */}
      <GroupHeader id="settings" title="7. KI, Einstellungen & Zugriff" count={6} color={C.green} />
      <GroupBody id="settings">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TableCard title="ki_settings" color={C.purple} note="KI-Funktions-Konfiguration" fields={[
              { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
              { name: 'funktion', type: 'TEXT UNIQUE', desc: 'scene_summary | entity_detect | style_check | ...' },
              { name: 'provider', type: 'TEXT', desc: 'ollama | mistral | openai | claude' },
              { name: 'model_name', type: 'TEXT', desc: 'z.B. llama3.2, mistral-large-latest' },
              { name: 'enabled', type: 'BOOL', desc: 'An/Aus' },
            ]} />
            <TableCard title="ki_providers" color={C.purple} note="Zentralisierte Provider-Verwaltung (v31)" fields={[
              { name: 'provider', type: 'TEXT PK', desc: 'ollama | mistral | openai | claude' },
              { name: 'api_key', type: 'TEXT', desc: 'API-Schluessel (oder ENV-Var)' },
              { name: 'is_active', type: 'BOOL', desc: 'Provider aktiv?' },
              { name: 'dsgvo_level', type: 'TEXT', desc: 'gruen | orange | rot' },
              { name: 'tokens_in / tokens_out', type: 'BIGINT', desc: 'Verbrauchte Tokens' },
              { name: 'cost_eur', type: 'NUMERIC', desc: 'Kumulative Kosten in EUR' },
            ]} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <TableCard title="app_settings" color={C.gray} note="Globale Einstellungen" fields={[
              { name: 'key', type: 'TEXT PK', desc: 'Einstellungs-Key' },
              { name: 'value', type: 'TEXT', desc: 'Wert' },
            ]} />
            <TableCard title="user_settings" color={C.gray} note="Pro-User Praeferenzen" fields={[
              { name: 'user_id', type: 'TEXT PK', desc: 'Benutzer-ID' },
              { name: 'selected_production_id', type: 'UUID', desc: 'Letzte Produktion' },
              { name: 'ui_settings', type: 'JSONB', desc: 'Theme, Sidebar-State, ...' },
            ]} />
            <TableCard title="production_app_settings" color={C.gray} note="Pro-Produktion Overrides" fields={[
              { name: 'production_id', type: 'TEXT', desc: 'Staffel-ID' },
              { name: 'key', type: 'TEXT', desc: 'Einstellungs-Key' },
              { name: 'value', type: 'TEXT', desc: 'Wert' },
            ]} />
          </div>
          <TableCard title="dk_settings_access" color={C.orange} note="Drehbuchkoordinator-Zugriff" fields={[
            { name: 'id', type: 'SERIAL PK', desc: 'Interne ID' },
            { name: 'production_id', type: 'TEXT', desc: 'Staffel-ID' },
            { name: 'access_type', type: 'TEXT', desc: 'rolle | user' },
            { name: 'identifier', type: 'TEXT', desc: 'Rollenname oder user_id' },
          ]} />
        </div>
      </GroupBody>

      {/* ── Gruppe 7: Migrationshistorie ── */}
      <GroupHeader id="history" title="7. Migrationshistorie & Strukturwandel" count={1} color={C.gray} />
      <GroupBody id="history">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TableCard title="schema_migrations" color={C.gray} note="Migrations-Tracking (automatisch beim Backend-Start)" fields={[
            { name: 'name', type: 'TEXT PK', desc: 'Migrations-Dateiname (z.B. v51_drop_legacy_tables.sql)' },
            { name: 'applied_at', type: 'TSTZ', desc: 'Ausfuehrungszeitpunkt' },
          ]} />

          <InfoBox title="Strukturwandel v42–v51: Komplette Migration abgeschlossen" color={C.green}>
            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Altes Modell (v1–v41):</strong> staffeln → bloecke → episoden → stages → szenen.
                Jede Szene gehoerte genau einer Stage. Keine stabile Szenen-Identitaet ueber Fassungen hinweg.
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>Neues Modell (v43+):</strong> produktionen → folgen → werkstufen + scene_identities → dokument_szenen.
                Eine Szene hat eine stabile UUID und existiert in mehreren Werkstufen (N:M via dokument_szenen).
              </p>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>v47:</strong> TRUNCATE CASCADE + Rename staffeln → produktionen. Alle Daten neu importiert.
              </p>
              <p style={{ margin: 0 }}>
                <strong>v51 (2026-05-04):</strong> Alle Legacy-Tabellen endgueltig per DROP TABLE entfernt.
                Es gibt keine Altlasten mehr — das Datenmodell ist vollstaendig bereinigt.
              </p>
            </div>
          </InfoBox>

          <WarnBox title="Gedroppte Tabellen (v51 — existieren NICHT mehr in der DB)">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {[
                'szenen', 'stages', 'folgen_dokumente', 'folgen_dokument_fassungen',
                'szenen_versionen', 'kommentare', 'folgen_dokument_annotationen',
                'folgen_dokument_autoren', 'folgen_dokument_audit',
              ].map(t => (
                <span key={t} style={{
                  padding: '3px 8px', borderRadius: 4, textDecoration: 'line-through',
                  background: C.red + '10', border: `1px solid ${C.red}33`,
                  fontSize: 10, fontFamily: 'monospace', color: C.red,
                }}>{t}</span>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, lineHeight: 1.6, color: C.muted }}>
              Auch entfernt: <code>bloecke</code>, <code>episoden</code>, <code>folgen_meta</code> (fruehere Migrationen).
              Alle FK-Spalten zu diesen Tabellen (fassung_id, szene_id, stage_id) wurden ebenfalls gedropt.
            </div>
          </WarnBox>
        </div>
      </GroupBody>

      {/* ── Externe Verknuepfungen ── */}
      <Section title="Externe Verknuepfungen">
        <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { from: 'produktionen.produktion_db_id', to: 'Produktionsdatenbank productions.id (UUID)', desc: 'Staffel ↔ Produktion', color: C.blue },
            { from: 'folgen.produktion_db_id', to: 'Produktionsdatenbank episodes.id (UUID)', desc: 'Folge ↔ Episode', color: C.purple },
            { from: 'entities.external_id + external_app', to: 'z.B. kostuem-app, Vertragsdatenbank', desc: 'Generische Cross-App-Referenzen', color: C.orange },
            { from: 'scene_comment_events.messenger_annotation_id', to: 'messenger.app annotations.id', desc: 'Kommentar-Integration via Messenger', color: C.green },
          ].map(r => (
            <div key={r.from} style={{
              border: `1px solid ${r.color}44`, borderLeft: `3px solid ${r.color}`,
              borderRadius: 6, padding: '8px 12px', background: r.color + '08',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <code style={{ fontSize: 11, color: r.color }}>{r.from}</code>
                <span style={{ color: C.muted }}>→</span>
                <code style={{ fontSize: 11, color: C.muted }}>{r.to}</code>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{r.desc}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Import & Komparsen Tab
// ══════════════════════════════════════════════════════════════════════════════

function ImportKomparsenTab() {
  const spielTypen = [
    { typ: 'o.t.',  label: 'o.T. (ohne Text)',  color: C.gray,   desc: 'Reiner Hintergrund — Komparse wird weder in Regieanweisungen namentlich erwähnt noch hat er/sie Dialog.' },
    { typ: 'spiel', label: 'Hat Spiel',          color: C.orange, desc: 'Komparse wird in Regieanweisungen namentlich als agierende Figur beschrieben (z.B. „TRESENKRAFT reicht eine Tasse"), hat aber keinen Dialog.' },
    { typ: 'text',  label: 'Hat Text',           color: C.green,  desc: 'Komparse hat mindestens eine nummerierte Replik (z.B. „336. TRESENKRAFT — Hier bitte."). Die Anzahl der Repliken wird automatisch gezählt.' },
  ]

  const importSteps = [
    { num: 1, title: 'Upload & Format-Erkennung',  text: 'Die Datei wird hochgeladen und das Format automatisch erkannt (PDF, Final Draft, Fountain, Word, Celtx, WriterDuet). Das erkannte Format wird im Step 2 als Badge angezeigt.' },
    { num: 2, title: 'Dokument-Vorschau',           text: 'Links wird das Original-Dokument angezeigt (PDF im integrierten Viewer, Textformate als formatierter Text). Rechts die geparste Szenen-Übersicht — so kann man Original und Ergebnis direkt vergleichen.' },
    { num: 3, title: 'Szenen-Parsing',              text: 'Jede Szene wird mit Nummer, Motiv, INT/EXT, Tageszeit, Spieltag, Stoppzeit, Rollen und Komparsen extrahiert. Motive werden in Drehort-Gruppe (z.B. Stu. 02), Motiv (z.B. Gartenhaus) und Untermotiv (z.B. Küche) aufgesplittet und farblich getrennt dargestellt.' },
    { num: 4, title: 'Repliken-Zählung',            text: 'Für jede Rolle wird die Anzahl der Dialog-Repliken in der Szene gezählt. In der Vorschau erscheint hinter dem Namen ein blauer Tag „N Repl." — so sieht man sofort, welche Figur wie viel spricht.' },
    { num: 5, title: 'Komparsen-Erkennung',          text: 'Der Parser erkennt im Szenenkopf Einträge wie „2x Krankenpflegerin o.T., 4x PatientInnen o.T." und extrahiert Anzahl, Name und Header-o.T.-Flag.' },
    { num: 6, title: 'Content-Analyse (Spiel-Typ)',  text: 'Nach dem Parsen analysiert der Import den Szeneninhalt. Wird ein Komparse in Regieanweisungen erwähnt → Spiel (orange Tag). Hat er Dialog → Text:N (lila Tag). Sonst → o.T. (grau).' },
    { num: 7, title: 'Header-Flag bleibt erhalten', text: 'Wenn der Szenenkopf „o.T." sagt, aber die Content-Analyse Dialog findet, wird der Spiel-Typ auf „Hat Text" gesetzt — das header_o_t-Flag bleibt aber bestehen.' },
  ]

  const examples = [
    { pdf: '4x PatientInnen o.T.',     name: 'PatientInnen',     anzahl: 4,  spiel: 'o.t.',  header: true,  repliken: 0 },
    { pdf: '2x Krankenpflegerin o.T.', name: 'Krankenpflegerin', anzahl: 2,  spiel: 'o.t.',  header: true,  repliken: 0 },
    { pdf: 'Tresenkraft',             name: 'Tresenkraft',      anzahl: 1,  spiel: 'spiel', header: false, repliken: 0 },
    { pdf: 'Gast o.T.',               name: 'Gast',             anzahl: 1,  spiel: 'o.t.',  header: true,  repliken: 0 },
  ]

  const tarifTabelle = [
    { typ: 'o.t.',  tarif: 'Komparsenvertrag',        gage: '~100-150 EUR/Tag',  hinweis: 'Austauschbar, kein Continuity-Tracking noetig' },
    { typ: 'spiel', tarif: 'Komparsenvertrag (erh.)',  gage: '~150-200 EUR/Tag',  hinweis: 'Muss gezielt gecastet werden, braucht Probezeit + Regieanweisung' },
    { typ: 'text',  tarif: 'Kleinstdarstellervertrag', gage: '~200-300 EUR/Tag',  hinweis: 'Repliken-Anzahl entscheidet ueber Tarif-Grenze (ab ~5 Repliken ggf. Tagesdarsteller)' },
  ]

  const spielColor = (typ: string) => typ === 'text' ? C.green : typ === 'spiel' ? C.orange : C.gray

  const tag = (bg: string, color: string, text: string) => (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '0px 5px', borderRadius: 3, background: bg, color, whiteSpace: 'nowrap', marginLeft: 2 }}>{text}</span>
  )

  return (
    <div style={{ padding: '28px 0' }}>
      <Section title="Import-Vorschau (Step 2)">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          Nach dem Upload zeigt Step 2 eine Side-by-Side-Ansicht: links das Original-Dokument (PDF im Viewer,
          Text als formatierter Code), rechts die geparste Szenen-Übersicht mit allen erkannten Informationen.
        </p>

        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.text }}>Was in der Vorschau angezeigt wird</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.subtle }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Format-Badge + Metadaten</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Oben rechts: Das erkannte Dateiformat als schwarzes Badge (z.B. <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#000', color: '#fff' }}>FINAL DRAFT (.FDX)</span>),
                dahinter automatisch erkannte Metadaten (Dokumenttyp, Episode, Stand-Datum) und Statistiken (Szenen, Rollen, Komparsen, Motive, Gesamtlänge).
              </div>
            </div>
            <div style={{ padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.subtle }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Motiv-Erkennung (farblich aufgeteilt)</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 6 }}>
                Der Ort-Name wird in seine Bestandteile geparst und farblich getrennt dargestellt:
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '0px 5px', borderRadius: 3, background: '#E0E0E0', color: '#616161' }}>Stu. 02</span>
                <span style={{ fontWeight: 600, color: '#1B5E20' }}>Gartenhaus</span>
                <span style={{ color: '#ccc' }}>/</span>
                <span style={{ fontWeight: 500, color: '#2E7D32' }}>Küche</span>
                <span style={{ color: C.muted, marginLeft: 8, fontSize: 11 }}>= Drehort-Gruppe · Motiv · Untermotiv</span>
              </div>
            </div>
            <div style={{ padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.subtle }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Rollen mit Repliken</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 6 }}>
                Hinter jeder Rolle zeigt ein Tag die Anzahl der Dialog-Repliken in dieser Szene:
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#999', fontSize: 11 }}>Rollen: </span>
                <span>Lou</span>{tag('#E3F2FD', '#1565C0', '3 Repl.')}
                <span>, Jess</span>{tag('#E3F2FD', '#1565C0', '2 Repl.')}
                <span>, Daniel</span>
              </div>
            </div>
            <div style={{ padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.subtle }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Komparsen mit Spiel-Typ-Tags</div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 6 }}>
                Jeder Komparse zeigt Anzahl, Name und einen farbigen Tag für den Spiel-Typ:
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, color: '#7B1FA2' }}>
                <span style={{ color: '#999', fontSize: 11 }}>Komparsen: </span>
                <span style={{ fontWeight: 600 }}>4×</span> PatientInnen{tag('#F5F5F5', '#9E9E9E', 'o.T.')}
                <span>, Tresenkraft</span>{tag('#FFF3E0', '#E65100', 'Spiel')}
                <span>, Gast</span>{tag('#F3E5F5', '#7B1FA2', 'Text:2')}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Komparsen-Erkennung">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 24 }}>
          Beim Import eines Drehbuch-PDFs werden Komparsen automatisch aus dem Szenenkopf
          extrahiert, normalisiert und anhand des Szeneninhalts klassifiziert. Jeder Komparse wird
          <strong> einmal</strong> als Character angelegt und pro Szene mit Anzahl, Spiel-Typ und
          Repliken-Anzahl verknuepft.
        </p>

        {/* Drei Stufen */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.text }}>Die drei Spiel-Stufen</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {spielTypen.map(s => (
              <div key={s.typ} style={{
                display: 'flex', gap: 14, alignItems: 'flex-start',
                padding: '12px 16px', border: `1px solid ${C.border}`, borderRadius: 8,
                borderLeft: `4px solid ${s.color}`, background: C.subtle,
              }}>
                <div style={{
                  minWidth: 72, flexShrink: 0,
                  background: s.color + '22', color: s.color, border: `1px solid ${s.color}55`,
                  borderRadius: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px',
                  fontFamily: 'monospace', textAlign: 'center',
                }}>
                  {s.typ}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ablauf */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.text }}>So funktioniert der Import</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {importSteps.map(s => (
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

        {/* Beispiel-Tabelle */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 14, color: C.text }}>Beispiel: Was der Import daraus macht</h3>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', fontSize: 12 }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 50px 72px 50px 60px',
              gap: 0, padding: '8px 12px',
              background: C.surface, fontWeight: 700, fontSize: 11, color: C.muted,
              borderBottom: `1px solid ${C.border}`,
            }}>
              <span>PDF-Eintrag</span>
              <span>Character-Name</span>
              <span style={{ textAlign: 'center' }}>Anz.</span>
              <span style={{ textAlign: 'center' }}>Spiel-Typ</span>
              <span style={{ textAlign: 'center' }}>o.T.?</span>
              <span style={{ textAlign: 'center' }}>Repliken</span>
            </div>
            {examples.map((e, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 50px 72px 50px 60px',
                gap: 0, padding: '8px 12px', alignItems: 'center',
                borderBottom: i < examples.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <code style={{ fontSize: 11, color: C.muted }}>{e.pdf}</code>
                <span style={{ fontWeight: 600 }}>{e.name}</span>
                <span style={{ textAlign: 'center', fontFamily: 'monospace' }}>{e.anzahl}</span>
                <span style={{ textAlign: 'center' }}>
                  <span style={{
                    background: spielColor(e.spiel) + '22', color: spielColor(e.spiel),
                    border: `1px solid ${spielColor(e.spiel)}55`,
                    borderRadius: 4, fontSize: 10, fontWeight: 600, padding: '1px 6px',
                    fontFamily: 'monospace',
                  }}>{e.spiel}</span>
                </span>
                <span style={{ textAlign: 'center' }}>{e.header ? <Badge color={C.orange}>H</Badge> : <span style={{ color: C.gray }}>—</span>}</span>
                <span style={{ textAlign: 'center', fontFamily: 'monospace' }}>{e.repliken}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
            <Badge color={C.orange}>H</Badge> = Header-Flag: Der Szenenkopf im PDF enthielt „o.T.". Weicht der Spiel-Typ ab (z.B. „text" trotz Header-o.T.), liegt eine Diskrepanz vor.
          </div>
        </div>

        <InfoBox title="Hierarchie: Content schlaegt Header" color={C.blue}>
          Die Content-Analyse kann den Spiel-Typ nur <strong>hochstufen</strong> (o.t. → spiel → text), nie herunter.
          Eine Ausnahme: Reine Erwaehnung in Regieanweisungen ueberschreibt ein explizites „o.T." im Szenenkopf <strong>nicht</strong> —
          nur gefundener Dialog stuft hoch. Atmosphaerische Beschreibungen wie „PATIENTEN warten auf dem Flur" aendern nichts
          am o.T.-Status, wenn der Szenenkopf dies so vorsieht.
        </InfoBox>
      </Section>

      <Section title="Bedeutung fuer die Produktion">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
          Die drei Spiel-Stufen haben direkte Auswirkungen auf Vergütung, Disposition und Continuity:
        </p>
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', fontSize: 12 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '72px 1fr 1fr 1fr',
            gap: 0, padding: '8px 12px',
            background: C.surface, fontWeight: 700, fontSize: 11, color: C.muted,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span>Typ</span>
            <span>Vertragsart</span>
            <span>Richtwert Tagesgage</span>
            <span>Hinweis</span>
          </div>
          {tarifTabelle.map((t, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '72px 1fr 1fr 1fr',
              gap: 0, padding: '10px 12px', alignItems: 'flex-start',
              borderBottom: i < tarifTabelle.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span>
                <span style={{
                  background: spielColor(t.typ) + '22', color: spielColor(t.typ),
                  border: `1px solid ${spielColor(t.typ)}55`,
                  borderRadius: 4, fontSize: 10, fontWeight: 600, padding: '1px 6px',
                  fontFamily: 'monospace',
                }}>{t.typ}</span>
              </span>
              <span style={{ fontSize: 12 }}>{t.tarif}</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.text }}>{t.gage}</span>
              <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{t.hinweis}</span>
            </div>
          ))}
        </div>

        <InfoBox title="Repliken-Anzahl und Tarif-Grenze" color={C.orange}>
          Bei Komparsen mit Spiel-Typ „text" wird die Anzahl der nummerierten Repliken automatisch gezaehlt.
          Ab ca. 5 Repliken kann ein Komparse tariflich als <strong>Tagesdarsteller</strong> eingestuft werden —
          dies ist fuer die Kalkulation und Vertragserstellung relevant.
        </InfoBox>
      </Section>

      <Section title="Datenmodell">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>
          Die Komparsen-Daten liegen auf der Verknuepfungstabelle <code style={{ fontSize: 11 }}>scene_characters</code> —
          nicht auf dem Character selbst. Derselbe Komparse kann in verschiedenen Szenen unterschiedliche Werte haben.
        </p>
        <TableCard
          title="scene_characters"
          color={C.purple}
          note="Verknuepfung Character ↔ Szene (pro Szene pro Character ein Eintrag)"
          fields={[
            { name: 'character_id',     type: 'UUID',    desc: 'Referenz auf characters (sauberer Name, einmalig)', ok: true },
            { name: 'scene_identity_id', type: 'UUID',   desc: 'Referenz auf die Szene', ok: true },
            { name: 'kategorie_id',     type: 'INT',     desc: 'Episoden-Rolle oder Komparse o.T.', ok: true },
            { name: 'anzahl',           type: 'INT',     desc: 'Wie viele Komparsen dieses Typs (Default: 1)', ok: true },
            { name: 'spiel_typ',        type: 'TEXT',    desc: 'o.t. | spiel | text — automatisch aus Content-Analyse', ok: true },
            { name: 'repliken_anzahl',  type: 'INT',     desc: 'Anzahl nummerierter Dialog-Repliken (nur bei spiel_typ = text)', ok: true },
            { name: 'header_o_t',       type: 'BOOLEAN', desc: 'true = Szenenkopf im PDF enthielt „o.T."', ok: true },
            { name: 'ist_gruppe',       type: 'BOOLEAN', desc: 'true = Gruppenbezeichnung (PatientInnen, Gaeste)', ok: true },
          ]}
        />
      </Section>
    </div>
  )
}

// ── Rechtschreibung & Grammatik Tab ─────────────────────────────────────────

function RechtschreibungTab() {
  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px 0' }}>Rechtschreibung & Grammatik</h1>
      <p style={{ color: C.muted, fontSize: 12, margin: '0 0 32px 0', lineHeight: 1.6 }}>
        Die Script-App bietet drei Stufen der Rechtschreibprüfung — von einfacher Browserunterstützung bis zu
        professioneller KI-gestützter Grammatikanalyse.
      </p>

      {/* ── Übersicht: 3 Modi ── */}
      <Section title="1. Drei Prüfmodi im Überblick">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Aus */}
          <div style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            padding: 20,
            background: C.surface,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 16,
              background: C.gray, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 10px', borderRadius: 10,
            }}>AUS</div>
            <div style={{ fontSize: 28, textAlign: 'center', margin: '8px 0 12px' }}>🚫</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>Keine Prüfung</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
              Keinerlei Markierungen im Text. Geeignet für reines Lesen, Formatierung oder wenn
              Browser-Spellcheck stört.
            </p>
          </div>
          {/* Browser */}
          <div style={{
            border: `1px solid ${C.blue}55`,
            borderRadius: 10,
            padding: 20,
            background: C.blue + '08',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 16,
              background: C.blue, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 10px', borderRadius: 10,
            }}>BROWSER</div>
            <div style={{ fontSize: 28, textAlign: 'center', margin: '8px 0 12px' }}>🔤</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>Browser-Spellcheck</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
              Nutzt die eingebaute Rechtschreibprüfung des Browsers (Chrome, Firefox, Edge).
              Erkennt Tippfehler mit <span style={{ borderBottom: '2px wavy #FF3B30', paddingBottom: 1 }}>roten Wellenlinien</span>.
              Keine Grammatikprüfung.
            </p>
          </div>
          {/* LanguageTool */}
          <div style={{
            border: `1px solid ${C.green}55`,
            borderRadius: 10,
            padding: 20,
            background: C.green + '08',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -10, left: 16,
              background: C.green, color: '#fff', fontSize: 10, fontWeight: 700,
              padding: '2px 10px', borderRadius: 10,
            }}>LANGUAGETOOL</div>
            <div style={{ fontSize: 28, textAlign: 'center', margin: '8px 0 12px' }}>✨</div>
            <div style={{ fontSize: 13, fontWeight: 600, textAlign: 'center', marginBottom: 8 }}>LanguageTool</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
              Server-seitige Prüfung mit LanguageTool. Erkennt Rechtschreib- <em>und</em> Grammatikfehler,
              Stilprobleme und Zeichensetzung. Markierungen direkt im Editor.
            </p>
          </div>
        </div>

        {/* Vergleichstabelle */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
          <thead>
            <tr>
              {['Funktion', 'Aus', 'Browser', 'LanguageTool', 'Grammarly'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '8px 10px', fontWeight: 700,
                  borderBottom: `2px solid ${C.border}`,
                  background: C.subtle,
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { feat: 'Tippfehler erkennen',       aus: '—', browser: '✓', lt: '✓', gram: '✓' },
              { feat: 'Grammatikprüfung',           aus: '—', browser: '—', lt: '✓', gram: '✓✓' },
              { feat: 'Stilvorschläge',             aus: '—', browser: '—', lt: '✓', gram: '✓✓' },
              { feat: 'Zeichensetzung',             aus: '—', browser: '—', lt: '✓', gram: '✓✓' },
              { feat: 'Synonyme / Umformulierung',  aus: '—', browser: '—', lt: '—', gram: '✓✓' },
              { feat: 'KI-Textverbesserung',        aus: '—', browser: '—', lt: '—', gram: '✓✓' },
              { feat: 'Funktioniert offline',       aus: '✓', browser: '✓', lt: '—', gram: '—' },
              { feat: 'Datenschutz (lokal)',         aus: '✓', browser: '✓', lt: '✓ᴴ', gram: '—' },
              { feat: 'Kosten',                     aus: 'Frei', browser: 'Frei', lt: 'Frei', gram: 'Freemium' },
            ].map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : C.subtle }}>
                <td style={{ padding: '6px 10px', fontWeight: 500 }}>{r.feat}</td>
                <td style={{ padding: '6px 10px', color: r.aus === '—' ? C.gray : C.green, textAlign: 'center' }}>{r.aus}</td>
                <td style={{ padding: '6px 10px', color: r.browser === '—' ? C.gray : C.green, textAlign: 'center' }}>{r.browser}</td>
                <td style={{ padding: '6px 10px', color: r.lt === '—' ? C.gray : C.green, textAlign: 'center' }}>{r.lt}</td>
                <td style={{ padding: '6px 10px', color: r.gram === '—' ? C.gray : C.green, textAlign: 'center', fontWeight: r.gram === '✓✓' ? 700 : 400 }}>{r.gram}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 10, color: C.muted, margin: '4px 0 0' }}>
          ✓ᴴ = LanguageTool läuft auf unserem eigenen Server — Texte verlassen nicht die Firma.
        </p>
      </Section>

      {/* ── Modus aktivieren ── */}
      <Section title="2. Rechtschreibprüfung aktivieren">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: '0 0 20px' }}>
          Die Rechtschreibprüfung wird über das <strong>Ansichtsmenü</strong> gesteuert.
        </p>
        {/* Step-by-step visual */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            {
              step: '1',
              title: 'Ansichtsmenü öffnen',
              desc: 'Klicke auf das Augen-Symbol (👁) in der oberen Leiste.',
              visual: (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#000', color: '#fff', padding: '8px 16px', borderRadius: 8,
                  fontSize: 13,
                }}>
                  <span style={{ fontSize: 18 }}>👁</span>
                  <span style={{ fontWeight: 600 }}>Ansicht</span>
                </div>
              ),
            },
            {
              step: '2',
              title: 'Rechtschreibprüfung finden',
              desc: 'Scrolle zum Abschnitt „Rechtschreibpruefung" im Ansichtsmenü.',
              visual: (
                <div style={{
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '12px 16px', display: 'inline-block',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: C.muted }}>Rechtschreibpruefung</div>
                  <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                    {['Aus', 'Browser', 'LanguageTool'].map((label, i) => (
                      <button key={label} style={{
                        padding: '6px 14px', fontSize: 11, fontWeight: i === 2 ? 700 : 400,
                        border: 'none', borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                        background: i === 2 ? C.green + '20' : 'transparent',
                        color: i === 2 ? C.green : C.muted,
                        cursor: 'default',
                      }}>{label}</button>
                    ))}
                  </div>
                </div>
              ),
            },
            {
              step: '3',
              title: 'Modus auswählen',
              desc: 'Wähle „LanguageTool" für die beste Erkennung. Die Prüfung startet automatisch nach 2 Sekunden Tipp-Pause.',
              visual: null,
            },
          ].map(s => (
            <div key={s.step} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: C.blue,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>{s.step}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                <p style={{ fontSize: 11, color: C.muted, margin: '0 0 8px', lineHeight: 1.5 }}>{s.desc}</p>
                {s.visual}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── LanguageTool Markierungen ── */}
      <Section title="3. Fehler-Markierungen verstehen">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, margin: '0 0 20px' }}>
          LanguageTool markiert Fehler direkt im Text mit farbigen Wellenlinien.
          Ein Klick auf eine Markierung öffnet das Korrektur-Popup.
        </p>
        <div style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
          {/* Rechtschreibfehler */}
          <div style={{
            flex: 1, border: `1px solid ${C.red}44`, borderRadius: 10,
            padding: 20, background: C.red + '06',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.red }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Rechtschreibfehler</span>
            </div>
            <div style={{
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '16px 20px', fontFamily: "'Courier Prime', Courier, monospace", fontSize: 14,
              lineHeight: 1.8,
            }}>
              Anna geht in die{' '}
              <span style={{
                textDecoration: 'underline wavy #FF3B30',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>Küche</span>{' '}
              und setzt sich an den{' '}
              <span style={{
                textDecoration: 'underline wavy #FF3B30',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>Tich</span>.
            </div>
            <p style={{ fontSize: 10, color: C.red, margin: '8px 0 0', fontWeight: 600 }}>
              Rote Wellenlinie = Wort nicht im Wörterbuch
            </p>
          </div>
          {/* Grammatikfehler */}
          <div style={{
            flex: 1, border: `1px solid ${C.orange}44`, borderRadius: 10,
            padding: 20, background: C.orange + '06',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: C.orange }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>Grammatik / Stil</span>
            </div>
            <div style={{
              background: '#fff', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '16px 20px', fontFamily: "'Courier Prime', Courier, monospace", fontSize: 14,
              lineHeight: 1.8,
            }}>
              Peter{' '}
              <span style={{
                textDecoration: 'underline wavy #FFCC00',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>gehen</span>{' '}
              nach Hause und{' '}
              <span style={{
                textDecoration: 'underline wavy #FFCC00',
                textDecorationSkipInk: 'none',
                textUnderlineOffset: '3px',
              }}>trinken</span>{' '}
              Kaffee.
            </div>
            <p style={{ fontSize: 10, color: C.orange, margin: '8px 0 0', fontWeight: 600 }}>
              Gelbe Wellenlinie = Grammatik, Stil oder Zeichensetzung
            </p>
          </div>
        </div>

        {/* Korrektur-Popup */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Korrektur-Popup</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '14px 18px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              maxWidth: 300, fontSize: 12, lineHeight: 1.5,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: C.text }}>
                Möglicher Tippfehler gefunden.
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Tisch', 'Tief', 'Tick'].map(r => (
                  <span key={r} style={{
                    padding: '4px 12px', borderRadius: 6,
                    background: C.green + '18', color: C.green,
                    fontWeight: 600, fontSize: 11, cursor: 'pointer',
                    border: `1px solid ${C.green}33`,
                  }}>{r}</span>
                ))}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: 0 }}>
                <strong>Klick auf eine Markierung</strong> öffnet das Popup mit Korrekturvorschlägen.
                Ein Klick auf einen Vorschlag ersetzt das markierte Wort sofort im Text.
              </p>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: '8px 0 0' }}>
                Die Prüfung läuft automatisch: Nach jeder Tipp-Pause von 2 Sekunden wird der
                aktuelle Szenen-Text geprüft und die Markierungen aktualisiert.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Grammarly ── */}
      <Section title="4. Grammarly — Erweiterte Prüfung (empfohlen)">
        <div style={{
          border: `2px solid ${C.purple}`,
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 24,
        }}>
          {/* Header */}
          <div style={{
            background: `linear-gradient(135deg, ${C.purple}, #7C3AED)`,
            padding: '20px 24px',
            color: '#fff',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>G</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Grammarly Browser-Extension</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>
                  KI-gestützte Grammatik-, Stil- und Tonanalyse — funktioniert in jedem Textfeld
                </div>
              </div>
            </div>
          </div>

          {/* Vorteile */}
          <div style={{ padding: '20px 24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Vorteile gegenüber LanguageTool</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { icon: '🎯', title: 'Bessere Erkennung', desc: 'KI-Modell erkennt mehr Fehler und versteht Kontext besser' },
                { icon: '💡', title: 'Umformulierungen', desc: 'Schlägt alternative Formulierungen und Synonyme vor' },
                { icon: '🎭', title: 'Ton-Analyse', desc: 'Erkennt ob der Text formell, freundlich oder sachlich klingt' },
                { icon: '📊', title: 'Lesbarkeit', desc: 'Zeigt Lesbarkeits-Score und schlägt Vereinfachungen vor' },
              ].map(v => (
                <div key={v.title} style={{
                  display: 'flex', gap: 10, padding: '10px 12px',
                  background: C.subtle, borderRadius: 8,
                }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{v.icon}</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{v.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.4 }}>{v.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Installations-Anleitung */}
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 16 }}>Installation in 4 Schritten</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Step 1 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>1</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Grammarly herunterladen</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Öffne den Extension-Store deines Browsers und installiere die Grammarly-Erweiterung:
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {[
                  { name: 'Chrome', url: 'https://chromewebstore.google.com/detail/grammarly-ai-writing-and/kbfnbcaeplbcioakkpcpgfkobkghlhen', color: '#4285F4' },
                  { name: 'Firefox', url: 'https://addons.mozilla.org/de/firefox/addon/grammarly-1/', color: '#FF7139' },
                  { name: 'Edge', url: 'https://microsoftedge.microsoft.com/addons/detail/grammarly-ai-writing-and/cnlefmmeadmemmdciolhbnfeacpdfbkd', color: '#0078D7' },
                  { name: 'Safari', url: 'https://apps.apple.com/app/grammarly-for-safari/id1462114288', color: '#007AFF' },
                ].map(b => (
                  <a
                    key={b.name}
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8,
                      background: b.color + '15', color: b.color,
                      fontSize: 11, fontWeight: 600, textDecoration: 'none',
                      border: `1px solid ${b.color}33`,
                      transition: 'background 0.15s',
                    }}
                  >
                    ↗ {b.name} Web Store
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>2</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Extension installieren</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Klicke auf <strong>„Hinzufügen"</strong> bzw. <strong>„Add to Browser"</strong>.
                Nach der Installation erscheint das Grammarly-Icon (grüner Kreis) in der Browser-Toolbar.
              </p>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                background: '#f0f0f0', padding: '8px 16px', borderRadius: 8,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#00C853',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: '#fff', fontWeight: 700,
                }}>G</div>
                <span style={{ fontSize: 11, color: C.muted }}>← Grammarly-Icon in der Toolbar</span>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>3</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Konto erstellen (kostenlos)</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Beim ersten Öffnen wirst du aufgefordert, ein Grammarly-Konto zu erstellen.
                Die <strong>kostenlose Version</strong> reicht für Rechtschreibung und grundlegende Grammatik.
                Premium (ca. 12€/Monat) bietet erweiterte Stilprüfung und Umformulierungen.
              </p>
              <div style={{
                display: 'flex', gap: 12,
                background: C.subtle, borderRadius: 8, padding: '12px 16px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 4 }}>Free</div>
                  <ul style={{ fontSize: 10, color: C.muted, margin: 0, paddingLeft: 14, lineHeight: 1.6 }}>
                    <li>Rechtschreibung</li>
                    <li>Basis-Grammatik</li>
                    <li>Zeichensetzung</li>
                  </ul>
                </div>
                <div style={{ width: 1, background: C.border }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.purple, marginBottom: 4 }}>Premium</div>
                  <ul style={{ fontSize: 10, color: C.muted, margin: 0, paddingLeft: 14, lineHeight: 1.6 }}>
                    <li>Alles aus Free</li>
                    <li>Erweiterte Grammatik</li>
                    <li>Stil & Ton-Analyse</li>
                    <li>KI-Umformulierungen</li>
                    <li>Plagiatsprüfung</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: C.purple,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, flexShrink: 0,
            }}>4</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>In der Script-App nutzen</div>
              <p style={{ fontSize: 11, color: C.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
                Grammarly funktioniert automatisch in jedem Textfeld — auch im Szenen-Editor der Script-App.
                Stelle dazu die Rechtschreibprüfung auf <strong>„Browser"</strong> oder <strong>„Aus"</strong>
                (LanguageTool und Grammarly gleichzeitig können verwirrend sein).
              </p>
              <div style={{
                background: C.orange + '12',
                border: `1px solid ${C.orange}33`,
                borderRadius: 8, padding: '10px 14px',
                fontSize: 11, color: C.text, lineHeight: 1.5,
              }}>
                <strong style={{ color: C.orange }}>Tipp:</strong> Wenn du Grammarly verwendest, stelle den
                Script-App Modus auf <strong>„Aus"</strong> oder <strong>„Browser"</strong>, um doppelte Markierungen
                zu vermeiden. Grammarly ersetzt dann effektiv die eingebaute Prüfung.
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Sprache einstellen ── */}
      <Section title="5. Sprache & Empfehlungen">
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{
            flex: 1, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 20, background: C.surface,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>LanguageTool</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              Die Standardsprache ist <strong>Deutsch (de-DE)</strong>.
              LanguageTool erkennt die Sprache auch automatisch.
              Die Prüfung läuft auf unserem eigenen Server — Texte werden <strong>nicht</strong> an
              externe Dienste gesendet.
            </p>
          </div>
          <div style={{
            flex: 1, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: 20, background: C.surface,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Grammarly</div>
            <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, margin: 0 }}>
              Grammarly prüft standardmäßig Englisch. Für <strong>Deutsch</strong>: Klicke auf
              das Grammarly-Icon → Einstellungen → Sprache → <strong>Deutsch</strong> auswählen.
              Grammarly sendet Texte an seine Cloud-Server zur Analyse.
            </p>
          </div>
        </div>

        {/* Empfehlung */}
        <div style={{
          marginTop: 20,
          background: `linear-gradient(135deg, ${C.blue}10, ${C.green}10)`,
          border: `1px solid ${C.blue}33`,
          borderRadius: 10, padding: '16px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Unsere Empfehlung</div>
          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.blue, marginBottom: 4 }}>Für Drehbuch-Autoren</div>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
                <strong>Grammarly (Browser)</strong> — beste Erkennung, funktioniert mit dem Drehbuch-Editor-Format,
                kennt Dialog- und Regieanweisungs-Kontext.
              </p>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.green, marginBottom: 4 }}>Für Datenschutz</div>
              <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, margin: 0 }}>
                <strong>LanguageTool</strong> — läuft auf unserem Server, keine Daten an Dritte.
                Gute Erkennung für Deutsch, etwas weniger Stil-Analyse als Grammarly.
              </p>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}

// ── Suchen & Ersetzen Tab ─────────────────────────────────────────────────────

function SuchenErsetzenTab() {
  const keyStyle: React.CSSProperties = {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
  }

  return (
    <div style={{ padding: '28px 0' }}>

      <Section title="Ueberblick">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Die <strong>Suchen & Ersetzen</strong>-Funktion ermoeglicht das Finden und Ersetzen von Text
            ueber verschiedene Ebenen hinweg — von der einzelnen Szene bis hin zu allen Produktionen.
          </p>
          <p style={{ marginBottom: 8 }}>
            Oeffnen mit <span style={keyStyle}>Ctrl</span> + <span style={keyStyle}>H</span> (Windows)
            oder <span style={keyStyle}>⌘</span> + <span style={keyStyle}>H</span> (Mac).
          </p>
        </div>
      </Section>

      <Section title="Scope-Ebenen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { scope: 'Aktuelle Szene', desc: 'Sucht nur im aktuell geoeffneten Editor. Treffer werden direkt im Text hervorgehoben (gelb = Treffer, orange = aktiver Treffer).', color: C.blue },
            { scope: 'Episode / Folge', desc: 'Sucht in allen Szenen der aktuellen Episode in der ausgewaehlten Werkstufe.', color: C.green },
            { scope: 'Block', desc: 'Sucht in allen Episoden eines Blocks. Die Werkstufe ist waehlbar. Ist eine Werkstufe in einer Episode nicht vorhanden, wird automatisch in der naechst hoeheren gesucht (Fallback).', color: C.orange },
            { scope: 'Staffel / Produktion', desc: 'Sucht in allen Episoden einer Produktion. Werkstufe waehlbar mit Fallback.', color: C.purple },
            { scope: 'Alle Produktionen', desc: 'Sucht ueber alle Produktionen/Staffeln hinweg. Es wird immer in der letzten Fassung (hoechste Versionsnummer) gesucht.', color: C.red },
          ].map(s => (
            <div key={s.scope} style={{ border: `1px solid ${s.color}44`, borderLeft: `3px solid ${s.color}`, borderRadius: 6, padding: '8px 14px', background: s.color + '08' }}>
              <strong style={{ color: s.color, fontSize: 12 }}>{s.scope}</strong>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Werkstufen-Fallback">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Bei Suche ueber Block oder Staffel kann es vorkommen, dass eine Episode noch kein Drehbuch hat,
            aber bereits ein Treatment oder eine Beschreibung. In diesem Fall greift der <strong>Fallback</strong>:
          </p>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
          background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 12, fontWeight: 500,
        }}>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#757575', color: '#fff' }}>Notiz</span>
          <span style={{ color: C.muted }}>→</span>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#FF9500', color: '#fff' }}>Beschreibung</span>
          <span style={{ color: C.muted }}>→</span>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#AF52DE', color: '#fff' }}>Treatment</span>
          <span style={{ color: C.muted }}>→</span>
          <span style={{ padding: '3px 10px', borderRadius: 4, background: '#007AFF', color: '#fff' }}>Drehbuch</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
          In der Ergebnisliste werden Fallback-Treffer mit <Badge color={C.orange}>Treatment ↑</Badge> gekennzeichnet.
        </div>
      </Section>

      <Section title="Suchoptionen">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Option</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Beschreibung</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Gross-/Kleinschreibung', 'Unterscheidet zwischen "Martha" und "MARTHA". Standardmaessig aus.'],
              ['Nur ganze Woerter', 'Findet "Rosen" nicht in "Rosenstrauch". Nutzt Wortgrenzen.'],
              ['Regulaere Ausdruecke', 'Erlaubt Regex-Patterns wie z.B. MARTHA|MARIA oder Szene\\s\\d+.'],
            ].map(([opt, desc]) => (
              <tr key={opt} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{opt}</td>
                <td style={{ padding: '6px 8px', color: C.muted }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Content-Filter">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Mit den Toggle-Buttons <Badge color={C.blue}>Beschreibung</Badge> <Badge color={C.blue}>Treatment</Badge> <Badge color={C.blue}>Drehbuch</Badge> bestimmen
            Sie, in welchen Werkstufen-Typen gesucht wird. Alle sind standardmaessig aktiv.
          </p>
        </div>
      </Section>

      <Section title="Ergebnisanzeige">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>

          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.text }}>In der aktuellen Szene</h3>
          <p style={{ marginBottom: 12 }}>
            Treffer werden direkt im Editor hervorgehoben. Navigieren Sie mit den Pfeil-Buttons
            oder <span style={keyStyle}>Enter</span> (naechster) / <span style={keyStyle}>Shift+Enter</span> (vorheriger) durch die Treffer.
            Der Zaehler zeigt z.B. "3 von 47".
          </p>

          <div style={{
            display: 'flex', gap: 12, marginBottom: 16, padding: 12, borderRadius: 8,
            background: 'var(--bg-subtle)', alignItems: 'center',
          }}>
            <div style={{ width: 80, height: 24, background: '#ffe566', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
              Treffer
            </div>
            <span style={{ color: C.muted, fontSize: 11 }}>= gelbes Highlight</span>
            <div style={{ width: 80, height: 24, background: '#FF9500', color: '#fff', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>
              Aktiv
            </div>
            <span style={{ color: C.muted, fontSize: 11 }}>= oranges Highlight (aktueller Treffer)</span>
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: C.text }}>Ueber mehrere Episoden</h3>
          <p style={{ marginBottom: 8 }}>
            Die Ergebnisse erscheinen im Seitenpanel, gruppiert nach Episode (Accordion).
            Klick auf einen Treffer navigiert direkt zur betreffenden Szene.
          </p>

          <div style={{
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
            marginBottom: 16, fontSize: 11,
          }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', fontWeight: 600, borderBottom: `1px solid ${C.border}` }}>
              ▼ Folge 4711 — 12 Treffer
            </div>
            <div style={{ padding: '6px 12px 6px 24px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 500 }}>Sz. 3</span> <span style={{ color: C.muted }}>(Cafe)</span>
              <span style={{ float: 'right', fontSize: 10, color: C.muted }}>[Drehbuch]</span>
              <div style={{ color: C.muted, marginTop: 2 }}>...MARTHA betritt das...</div>
            </div>
            <div style={{ padding: '6px 12px 6px 24px' }}>
              <span style={{ fontWeight: 500 }}>Sz. 8</span> <span style={{ color: C.muted }}>(Wohnung)</span>
              <span style={{ float: 'right', fontSize: 10, color: C.orange }}>[Treatment ↑]</span>
              <div style={{ color: C.muted, marginTop: 2 }}>...ruft MARTHA an und...</div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Ersetzen & Gesperrte Szenen">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            <strong>Gesperrte Szenen</strong> (Episoden mit aktivem Lock) werden bei der Suche gefunden, aber
            beim Ersetzen <strong>uebersprungen</strong>. Nach dem Ersetzen zeigt eine Meldung:
          </p>
          <div style={{
            padding: '8px 14px', borderRadius: 8, marginBottom: 12,
            background: '#00C85318', border: '1px solid #00C85344',
            fontSize: 12,
          }}>
            <span style={{ color: '#00C853' }}>42 Ersetzungen durchgefuehrt.</span>
            <span style={{ color: '#FF9500', marginLeft: 8 }}>3 Szenen waren gesperrt.</span>
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, marginTop: 16, color: C.text }}>Selektives Ersetzen</h3>
          <p style={{ marginBottom: 8 }}>
            Bei Scope Episode oder groesser koennen Sie einzelne Treffer per Checkbox aus-/abwaehlen,
            bevor Sie "Alle ersetzen" klicken. Gesperrte Szenen sind automatisch deaktiviert.
          </p>
        </div>
      </Section>

      <Section title="Tastenkuerzel">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Kuerzel</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Ctrl/⌘ + H', 'Suchen & Ersetzen oeffnen/schliessen'],
              ['Enter', 'Naechster Treffer'],
              ['Shift + Enter', 'Vorheriger Treffer'],
              ['Escape', 'Dialog schliessen'],
            ].map(([key, action]) => (
              <tr key={key} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px' }}>
                  <span style={keyStyle}>{key}</span>
                </td>
                <td style={{ padding: '6px 8px', color: C.muted }}>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Regex-Beispiele">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Pattern</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Findet</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['MARTHA|MARIA', 'Beide Namen'],
                ['Szene\\s\\d+', '"Szene 1", "Szene 42" etc.'],
                ['\\b\\d{2}:\\d{2}\\b', 'Uhrzeiten wie "14:30"'],
                ['(Dr\\.|Prof\\.)\\s\\w+', '"Dr. Mueller", "Prof. Schmidt"'],
                ['^INT\\.', 'Zeilen die mit "INT." beginnen'],
              ].map(([pattern, finds]) => (
                <tr key={pattern} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}><code>{pattern}</code></td>
                  <td style={{ padding: '6px 8px', color: C.muted }}>{finds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

// ── Story-Str\u00e4nge Tab ──────────────────────────────────────────────────────
function StoryStaengeTab() {
  return (
    <div>
      <Section title="1. Was sind Story-Str\u00e4nge?">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text, marginBottom: 12 }}>
          Ein <strong>Strang</strong> (auch: Handlungsstrang, Story Arc) ist eine durchgehende Erz\u00e4hllinie, die sich \u00fcber mehrere Szenen und Folgen erstreckt.
          In der t\u00e4glichen Serie werden typischerweise 3\u20135 Str\u00e4nge pro Block parallel erz\u00e4hlt.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { label: 'Beziehungsdynamik (Soap)', color: '#FF6B6B', desc: 'Langfristige Beziehungs- und Figurenentwicklung' },
            { label: 'Thematischer Bogen (Genre)', color: '#4ECDC4', desc: 'Krimi, Mystery, Medizin \u2014 zeitlich begrenzt' },
            { label: 'Anthology', color: '#FFD93D', desc: 'Abgeschlossene Einzelgeschichte' },
          ].map(t => (
            <div key={t.label} style={{ flex: '1 1 200px', padding: 10, borderRadius: 8, border: `1px solid ${C.border}`, borderLeft: `4px solid ${t.color}` }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{t.desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          Zus\u00e4tzlich tr\u00e4gt jeder Strang ein <strong>Label</strong>: <Badge color={C.blue}>business</Badge> oder <Badge color={C.purple}>privat</Badge>,
          um den Fokus der Handlung einzuordnen.
        </p>
      </Section>

      <Section title="2. Workflow: Vom Future zum Drehbuch">
        <div style={{ background: C.surface, borderRadius: 8, padding: 16, border: `1px solid ${C.border}`, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
            {[
              { step: '1', label: 'Future', desc: 'Plot Team definiert Beats auf Block-Ebene', color: C.purple },
              { step: '2', label: 'Block-Beats', desc: 'Beats werden pro Folge verteilt', color: C.orange },
              { step: '3', label: 'Szenen-Zuweisung', desc: 'Autoren ordnen Beats einzelnen Szenen zu', color: C.blue },
              { step: '4', label: 'Drehbuch', desc: 'Szenen werden ausgeschrieben', color: C.green },
            ].map((s, i) => (
              <div key={s.step} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, zIndex: 1 }}>{s.step}</div>
                <div style={{ fontWeight: 700, fontSize: 11, marginTop: 6 }}>{s.label}</div>
                <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 2 }}>{s.desc}</div>
                {i < 3 && <div style={{ position: 'absolute', top: 14, left: '60%', right: '-40%', height: 2, background: C.border, zIndex: 0 }} />}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="3. Str\u00e4nge verwalten">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text, marginBottom: 12 }}>
          \u00d6ffne \u00fcber das <strong>Kontextmen\u00fc</strong> (drei Punkte oben rechts in der Szenen\u00fcbersicht) den Punkt <em>Str\u00e4nge verwalten</em>.
        </p>
        <div style={{ background: C.surface, borderRadius: 8, padding: 12, border: `1px solid ${C.border}`, marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Im Strang-Dialog kannst du:</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 2, color: C.text }}>
            <li>Neuen Strang anlegen (Name, Farbe, Typ, Label)</li>
            <li>Status \u00e4ndern: <Badge color={C.green}>aktiv</Badge> <Badge color={C.orange}>ruhend</Badge> <Badge color={C.gray}>beendet</Badge></li>
            <li>Charaktere zuweisen (aus der Rollenliste der Produktion)</li>
            <li>Beats definieren und als erledigt markieren</li>
            <li>Untertitel und Kurzinhalt pflegen</li>
          </ul>
        </div>
      </Section>

      <Section title="4. Szenen zuweisen">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text, marginBottom: 12 }}>
          Eine Szene kann <strong>mehreren Str\u00e4ngen</strong> zugeordnet werden (\u201eKreuzungsszene\u201c). Zwei Wege:
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: C.blue }}>Einzeln im Editor</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              Im Szenen-Kopf unter <em>S\u00b7</em> findest du die Strang-Chips. Klicke <strong>+</strong> um einen Strang hinzuzuf\u00fcgen, <strong>\u00d7</strong> um ihn zu entfernen.
            </div>
          </div>
          <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, color: C.green }}>Bulk in der \u00dcbersicht</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
              \u00dcber <em>Mehrere ausw\u00e4hlen</em> im Men\u00fc markierst du beliebig viele Szenen. Unten erscheint eine Toolbar zum Zuweisen oder Entfernen.
            </div>
          </div>
        </div>
      </Section>

      <Section title="5. Farbmodus: Strang-Streifen">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text, marginBottom: 12 }}>
          Im Kontextmen\u00fc unter <em>Farbe</em> w\u00e4hlst du zwischen drei Modi:
        </p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { label: 'Lichtstimmung', desc: 'INT/EXT + Tageszeit bestimmen die Farbe (Standard)', color: '#E8F5E9' },
            { label: 'Strang', desc: 'Farbige Streifen (3px) zeigen die zugeordneten Str\u00e4nge', color: '#E3F2FD' },
            { label: 'Aus', desc: 'Keine Farbkodierung', color: C.surface },
          ].map(m => (
            <div key={m.label} style={{ flex: '1 1 150px', padding: 10, borderRadius: 8, background: m.color, border: `1px solid ${C.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{m.desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
          Im Strang-Modus hat jeder aktive Strang eine feste x-Position (3px breit, 1px Abstand).
          Nur zugeordnete Str\u00e4nge zeigen Farbe \u2014 nicht zugeordnete Positionen bleiben transparent.
        </p>
      </Section>

      <Section title="6. Story-Radar">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text, marginBottom: 12 }}>
          Das <strong>Story-Radar</strong> ist ein Seitenpanel, das du \u00fcber das Kontextmen\u00fc \u00f6ffnest.
          Es zeigt pro Strang:
        </p>
        <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12, lineHeight: 2, color: C.text }}>
          <li>Anzahl zugeordneter Szenen und Beats (offen/erledigt)</li>
          <li>Beteiligte Charaktere</li>
          <li><strong>Pacing-Hinweise</strong>: L\u00fccke wenn ein Strang \u22653 Folgen nicht vorkommt</li>
        </ul>
      </Section>

      <Section title="7. Platzhalter-Szenen">
        <p style={{ fontSize: 13, lineHeight: 1.7, color: C.text, marginBottom: 12 }}>
          Im Kontextmen\u00fc kannst du \u00fcber <em>Platzhalter-Szenen anlegen</em> schnell N leere Szenen erstellen.
          Optional kann direkt ein Strang zugewiesen werden. Typischer Anwendungsfall:
          Das Plot Team plant eine Folge grob und legt z.B. 25 Platzhalter an, bevor Details ausgearbeitet werden.
        </p>
      </Section>
    </div>
  )
}

function HilfePage() {
  const [activeSection, setActiveSection] = useState<string>('offline')
  const navigate = useNavigate()

  const NAV_ITEMS = [
    { id: 'offline',           label: 'Offline-Modus',         icon: '📶' },
    { id: 'szenen-editor',     label: 'Szenenübersicht & Editor', icon: '🖊️' },
    { id: 'nummerierung',      label: 'Szenen & Nummerierung',  icon: '🔢' },
    { id: 'dokument-editor',   label: 'Dokument-Editor',        icon: '📝' },
    { id: 'kommentare',        label: 'Kommentare',             icon: '💬' },
    { id: 'szenen-fassungen',  label: 'Szenen & Fassungen',     icon: '🔀' },
    { id: 'rechtschreibung',   label: 'Rechtschreibung',         icon: '✍️' },
    { id: 'import-komparsen',  label: 'Import & Komparsen',     icon: '🎬' },
    { id: 'suchen-ersetzen',   label: 'Suchen & Ersetzen',      icon: '🔍' },
    { id: 'story-straenge',    label: 'Story-Str\u00e4nge',     icon: '🧶' },
    { id: 'sonderszenen',      label: 'Sonderszenen',           icon: '🎭' },
    { id: 'werkstufen-labels', label: 'Werkstufen & Labels',    icon: '🏷️' },
    { id: 'datenmodell',       label: 'Datenmodell',            icon: '🗄️' },
    { id: 'vorlagen-ocr',     label: 'Vorlagen & OCR',          icon: '📄' },
  ] as const

  return (
    <AppShell hideProductionSelector>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Side Navigation ── */}
        <nav style={{
          width: 220, flexShrink: 0,
          borderRight: `1px solid ${C.border}`,
          background: C.surface,
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '20px 16px 12px' }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.muted, fontSize: 12, padding: '0 0 12px 0',
              }}
            >
              ← Zurueck
            </button>
            <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, lineHeight: 1.3 }}>Handbuch</h1>
            <p style={{ color: C.muted, fontSize: 11, margin: '4px 0 0' }}>Script-App Dokumentation</p>
          </div>

          <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  border: 'none', borderRadius: 8,
                  background: activeSection === item.id ? C.blue + '15' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: activeSection === item.id ? 700 : 400,
                  color: activeSection === item.id ? C.text : C.muted,
                  textAlign: 'left',
                  width: '100%',
                  transition: 'background 0.15s, color 0.15s',
                  borderLeft: activeSection === item.id ? `3px solid ${C.blue}` : '3px solid transparent',
                }}
              >
                <span style={{ fontSize: 14, flexShrink: 0, width: 20, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* ── Content Area ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '32px 40px',
          maxWidth: 880,
          boxSizing: 'border-box',
        }}>
          {activeSection === 'offline' && <OfflineTab />}
          {activeSection === 'szenen-editor' && <SzenenEditorTab />}
          {activeSection === 'nummerierung' && <NummerierungTab />}
          {activeSection === 'dokument-editor' && <DokumentEditorHilfeTab />}
          {activeSection === 'kommentare' && <KommentareTab />}
          {activeSection === 'szenen-fassungen' && <SzenenFassungenTab />}
          {activeSection === 'rechtschreibung' && <RechtschreibungTab />}
          {activeSection === 'import-komparsen' && <ImportKomparsenTab />}
          {activeSection === 'suchen-ersetzen' && <SuchenErsetzenTab />}
          {activeSection === 'story-straenge' && <StoryStaengeTab />}
          {activeSection === 'sonderszenen' && <SonderszenentTab />}
          {activeSection === 'werkstufen-labels' && <WerkstufenLabelsTab />}
          {activeSection === 'datenmodell' && <DatenmodellTab />}
          {activeSection === 'vorlagen-ocr' && <VorlagenOcrTab />}
        </div>
      </div>
    </AppShell>
  )
}

// ── Sonderszenen Tab ──────────────────────────────────────────────────────
function SonderszenentTab() {
  // Inline icon components for the visual diagrams
  const TypeCard = ({ icon, title, color, subtitle, children }: {
    icon: string; title: string; color: string; subtitle: string; children: React.ReactNode
  }) => (
    <div style={{
      border: `2px solid ${color}`,
      borderRadius: 12,
      overflow: 'hidden',
      marginBottom: 24,
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${color}22 0%, ${color}08 100%)`,
        padding: '16px 20px',
        borderBottom: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ fontSize: 28 }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color }}>{title}</div>
          <div style={{ fontSize: 12, color: C.muted }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )

  const SceneHead = ({ parts, color }: { parts: string[]; color: string }) => (
    <div style={{
      fontFamily: 'monospace',
      fontSize: 12,
      background: '#000',
      color: '#fff',
      borderRadius: 8,
      padding: '10px 14px',
      marginBottom: 12,
      borderLeft: `4px solid ${color}`,
      lineHeight: 1.6,
    }}>
      {parts.map((p, i) => <div key={i}>{p}</div>)}
    </div>
  )

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, marginBottom: 4 }}>
      <span style={{ fontWeight: 600, color: C.text, minWidth: 140 }}>{label}</span>
      <span style={{ color: C.muted }}>{value}</span>
    </div>
  )

  return (
    <div>
      {/* Intro */}
      <div style={{
        background: `linear-gradient(135deg, ${C.purple}18 0%, ${C.orange}12 100%)`,
        border: `1px solid ${C.purple}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🎭</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Sonderszenen — Wechselschnitt, Stockshot, Flashback</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Neben regulaeren Szenen unterstuetzt die Script-App drei Sonderszenen-Typen mit
            strukturiertem Tracking. Jede Szene kann ueber den Szenenkopf als Sondertyp markiert werden.
            Die Terminologie (z.B. „Stockshot" vs. „Archivshot") ist produktionsweise konfigurierbar.
          </div>
        </div>
      </div>

      {/* ── 1. Uebersicht ── */}
      <Section title="1. Die drei Sondertypen im Ueberblick">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
          {[
            { icon: '⇄', label: 'Wechselschnitt', color: C.blue, desc: 'Zwei oder mehr Szenen werden parallel geschnitten — z.B. Telefonat, gleichzeitige Handlung.' },
            { icon: '📷', label: 'Stockshot', color: C.orange, desc: 'Kurze Einstellung ohne Dialog — Aussenansicht, Zeitsprung oder Stimmungswechsel. Kann aus dem Archiv stammen.' },
            { icon: '⏪', label: 'Flashback', color: C.purple, desc: 'Rueckblende auf eine fruehere Szene. Verweist auf die Ursprungsszene per Referenz.' },
          ].map((t, i) => (
            <div key={i} style={{
              border: `1px solid ${t.color}44`,
              borderRadius: 10,
              padding: '16px 14px',
              background: t.color + '08',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, color: t.color, marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{t.desc}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, fontStyle: 'italic' }}>
          Eine Szene kann nur einen Sondertyp gleichzeitig haben. Regulaere Szenen (kein Sondertyp) bleiben unveraendert.
        </p>
      </Section>

      {/* ── 2. Wechselschnitt ── */}
      <Section title="2. Wechselschnitt (Cross-Cutting)">
        <TypeCard icon="⇄" title="Wechselschnitt" color={C.blue} subtitle="Parallelmontage zweier oder mehrerer Szenen">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Ein Wechselschnitt verbindet eine Szene mit einer oder mehreren Partner-Szenen. Die Verknuepfung
            ist <strong>bidirektional</strong>: Markierst du Szene 8 als Wechselschnitt mit Szene 5 und 6,
            sehen auch Szene 5 und 6, dass sie Teil eines Wechselschnitts sind.
          </p>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Szenenkopf-Darstellung</div>
          <SceneHead color={C.blue} parts={[
            '8 · INT/EXT · WECHSELSCHNITT (mit Sz. 5, 6)',
          ]} />

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, marginTop: 16 }}>Bei Partner-Szenen (read-only)</div>
          <SceneHead color={C.blue} parts={[
            '5 · INT · LÜNEBURG KÜCHE · TAG — beteiligt an Wechselschnitt (Sz. 8)',
          ]} />

          <div style={{
            display: 'flex', gap: 12, marginTop: 16, padding: '12px 16px',
            background: C.blue + '0a', borderRadius: 8, border: `1px solid ${C.blue}22`,
          }}>
            <span style={{ fontSize: 18 }}>💡</span>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              <strong>Datenmodell:</strong> Die Partner-Beziehung wird in einer eigenen Tabelle (<Badge color={C.blue}>wechselschnitt_partner</Badge>)
              als N:M gespeichert. Jeder Partner hat eine Position (Reihenfolge im Schnitt).
              Beim Loeschen einer Wechselschnitt-Szene werden die Partner-Verknuepfungen automatisch entfernt.
            </div>
          </div>
        </TypeCard>
      </Section>

      {/* ── 3. Stockshot ── */}
      <Section title="3. Stockshot / Archivshot">
        <TypeCard icon="📷" title="Stockshot" color={C.orange} subtitle="Kurze Einstellung ohne Dialog — Ortswechsel, Zeitsprung, Stimmungswechsel">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Stockshots sind kurze Aufnahmen, die zwischen Szenen eingefuegt werden — z.B. eine
            Aussenansicht eines Gebaeudes, ein Sonnenuntergang oder ein Zeitraffer. Sie koennen aus dem
            <strong> Archiv</strong> stammen (bereits gefilmt) oder <strong>neu zu drehen</strong> sein.
          </p>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Szenenkopf-Darstellung</div>
          <SceneHead color={C.orange} parts={[
            'SS · STOCKSHOT: Aussenansicht Lüneburger Altstadt. — Ortswechsel [Neu zu drehen]',
          ]} />

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, marginTop: 20 }}>Drei Kategorien</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {[
              { cat: 'Ortswechsel', desc: 'Ueberleitung zwischen zwei Drehorten — z.B. Aussenansicht des naechsten Motivs.', ex: 'Aussenansicht Lüneburger Altstadt.' },
              { cat: 'Zeit vergeht', desc: 'Zeitsprung innerhalb der Handlung — z.B. Tag wird Nacht, Uhrzeiger, Kalender.', ex: 'Die Sonne wandert über den Himmel.' },
              { cat: 'Stimmungswechsel', desc: 'Aenderung der Lichtstimmung — z.B. Tag → Nacht. Kann folgende Szenen beeinflussen.', ex: 'Nacht über Lüneburg. Lichter gehen an.' },
            ].map((k, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 14px',
                border: `1px solid ${C.orange}33`, borderLeft: `3px solid ${C.orange}`, borderRadius: 8,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: C.orange, marginBottom: 3 }}>{k.cat}</div>
                  <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{k.desc}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: C.text, marginTop: 4, opacity: 0.6 }}>Beispiel: „{k.ex}"</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Stockshot-Archiv</div>
          <div style={{
            display: 'flex', gap: 12, padding: '14px 16px',
            background: C.orange + '0a', borderRadius: 8, border: `1px solid ${C.orange}22`,
          }}>
            <span style={{ fontSize: 18 }}>🗄️</span>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Das Archiv speichert pro Staffel, welche <strong>Motiv + Lichtstimmung</strong>-Kombinationen
              bereits gefilmt wurden. Wenn du einen Stockshot anlegst und die Kombination im Archiv existiert,
              wird <Badge color={C.green}>Aus Archiv</Badge> angezeigt. Andernfalls wird automatisch
              <Badge color={C.red}>Neu zu drehen</Badge> gesetzt.<br /><br />
              Bei einem Staffelwechsel kann das Archiv der vorherigen Staffel importiert werden
              (Drehbuchkoordination → Stockshot-Archiv).
            </div>
          </div>
        </TypeCard>
      </Section>

      {/* ── 4. Flashback ── */}
      <Section title="4. Flashback / Rueckblende">
        <TypeCard icon="⏪" title="Flashback" color={C.purple} subtitle="Rueckblende auf eine fruehere Szene mit Referenz-Verknuepfung">
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Eine Flashback-Szene verweist auf eine <strong>Ursprungsszene</strong> (ueber deren Szenen-Identitaet).
            So ist nachvollziehbar, auf welche Szene aus welcher Folge zurueckgeblendet wird.
            Die Referenz ist klickbar und navigiert zur Ursprungsszene.
          </p>

          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Szenenkopf-Darstellung</div>
          <SceneHead color={C.purple} parts={[
            '12 · INT · LÜNEBURG KÜCHE · NACHT — FLASHBACK (→ Sz. 5, Folge 4398)',
          ]} />

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <InfoRow label="Referenz-Szene:" value="Verknuepfung ueber scene_identities (UUID)" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <InfoRow label="Nummerierung:" value="Regulaer durchgezaehlt (wie normale Szenen)" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <InfoRow label="Statistik:" value="Wird mitgezaehlt (ist eine vollwertige Szene)" />
          </div>
        </TypeCard>
      </Section>

      {/* ── 5. Stimmungswechsel-Propagierung ── */}
      <Section title="5. Stimmungswechsel-Propagierung">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Ein Stockshot mit Kategorie <strong>Stimmungswechsel</strong> aendert die Lichtstimmung
          fuer alle folgenden Szenen — innerhalb einer Episode und staffeluebergreifend. Die neue
          Stimmung gilt, bis der naechste Stimmungswechsel kommt oder ein neuer dramaturgischer Tag beginnt.
        </p>

        {/* Visual: Timeline showing mood propagation */}
        <div style={{
          background: '#000',
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 16,
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#fff',
          lineHeight: 2,
        }}>
          <div style={{ opacity: 0.5, marginBottom: 4 }}>Szenen-Reihenfolge →</div>
          <div>
            <span style={{ color: '#FFD60A' }}>☀ Sz.1 TAG</span>
            {'  →  '}
            <span style={{ color: '#FFD60A' }}>☀ Sz.2 TAG</span>
            {'  →  '}
            <span style={{ color: C.orange, fontWeight: 700 }}>📷 SS: Stimmungswechsel → NACHT</span>
            {'  →  '}
            <span style={{ color: '#5E5CE6' }}>☾ Sz.3 NACHT</span>
            {'  →  '}
            <span style={{ color: '#5E5CE6' }}>☾ Sz.4 NACHT</span>
          </div>
          <div style={{ marginTop: 8, color: C.orange, fontSize: 10 }}>
            ⚠ Wenn Sz.3 noch „TAG" als Tageszeit hat → Warnung in der Szenenleiste
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 12, padding: '12px 16px',
          background: C.orange + '0a', borderRadius: 8, border: `1px solid ${C.orange}22`,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
            <strong>Inkonsistenz-Warnung:</strong> Wenn die Tageszeit einer Szene nicht zur aktuellen
            Stimmung passt (z.B. „TAG" nach einem Nacht-Stockshot), erscheint ein Warndreieck (⚠) in
            der Szenenleiste. Beim Umstellen auf eine Drehfassung werden alle Inkonsistenzen in einem
            Dialog aufgelistet.
          </div>
        </div>
      </Section>

      {/* ── 6. Terminologie ── */}
      <Section title="6. Terminologie-Konfiguration">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Die Begriffe fuer Sonderszenen-Typen sind produktionsweise konfigurierbar (Drehbuchkoordination → Terminologie).
        </p>
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          fontSize: 12,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 120px 120px',
            fontWeight: 700, fontSize: 11, padding: '8px 14px',
            background: C.surface, borderBottom: `1px solid ${C.border}`,
            color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <span>Key</span><span>Standard</span><span>Alternative</span>
          </div>
          {[
            { key: 'stockshot', std: 'Stockshot', alt: 'Archivshot' },
            { key: 'flashback', std: 'Flashback', alt: 'Rueckblende' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 120px 120px',
              padding: '8px 14px',
              borderBottom: i < 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <span style={{ fontFamily: 'monospace', color: C.blue }}>{r.key}</span>
              <span>{r.std}</span>
              <span style={{ color: C.muted }}>{r.alt}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. Datenmodell-Uebersicht ── */}
      <Section title="7. Datenmodell">
        <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>
          Die Sonderszenen-Erweiterung fuegt Spalten zur bestehenden <Badge color={C.blue}>dokument_szenen</Badge>-Tabelle
          hinzu und erstellt drei neue Tabellen.
        </p>

        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Erweiterte Spalten auf dokument_szenen</div>
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          fontSize: 12,
          marginBottom: 20,
        }}>
          {[
            { name: 'sondertyp', type: 'TEXT', desc: "NULL = normal. 'wechselschnitt' | 'stockshot' | 'flashback'" },
            { name: 'stockshot_kategorie', type: 'TEXT', desc: "'ortswechsel' | 'zeit_vergeht' | 'stimmungswechsel'" },
            { name: 'stockshot_stimmung', type: 'TEXT', desc: 'Freitext fuer Stimmungswechsel (z.B. NACHT)' },
            { name: 'stockshot_neu_drehen', type: 'BOOLEAN', desc: 'true = muss neu gefilmt werden (Default: false)' },
            { name: 'flashback_referenz_id', type: 'UUID', desc: 'FK → scene_identities.id (Ursprungsszene)' },
          ].map((f, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '200px 70px 1fr',
              padding: '7px 14px',
              borderBottom: i < 4 ? `1px solid ${C.border}` : 'none',
              background: i % 2 === 0 ? C.surface : 'transparent',
            }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.name}</span>
              <Badge color={C.purple}>{f.type}</Badge>
              <span style={{ color: C.muted }}>{f.desc}</span>
            </div>
          ))}
        </div>

        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Neue Tabellen (Migration v63)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          {[
            { name: 'wechselschnitt_partner', color: C.blue, desc: 'N:M Partner-Verknuepfung fuer Wechselschnitte. dokument_szene_id + partner_identity_id + position.' },
            { name: 'stockshot_archiv', color: C.orange, desc: 'Staffelweises Archiv gefilmter Motiv+Lichtstimmung-Kombinationen. UNIQUE pro Staffel.' },
            { name: 'stockshot_templates', color: C.green, desc: 'Oneliner-Vorlagen pro Kategorie mit Platzhaltern ({motiv}, {stimmung}).' },
          ].map((t, i) => (
            <div key={i} style={{
              border: `2px solid ${t.color}`,
              borderRadius: 8,
              overflow: 'hidden',
              fontSize: 11,
            }}>
              <div style={{
                background: t.color,
                color: '#fff',
                fontWeight: 700,
                padding: '6px 10px',
                fontFamily: 'monospace',
                fontSize: 11,
              }}>
                {t.name}
              </div>
              <div style={{ padding: '8px 10px', color: C.muted, lineHeight: 1.5 }}>{t.desc}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Vorlagen & OCR Tab ─────────────────────────────────────────────────────
function VorlagenOcrTab() {
  const C = { bg: '#fafafa', card: '#fff', border: '#e5e5e5', text: '#111', muted: '#666', blue: '#007AFF', green: '#00C853' }
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }
  const h2: React.CSSProperties = { fontSize: 16, fontWeight: 700, marginBottom: 12, color: C.text }
  const h3: React.CSSProperties = { fontSize: 14, fontWeight: 600, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.6, color: C.muted, marginBottom: 8 }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Dokument-Vorlagen & PDF-OCR</h1>

      <div style={card}>
        <h2 style={h2}>Dokument-Vorlagen (Notiz-Templates)</h2>
        <p style={p}>
          Vorlagen definieren das Layout und den Inhalt von Nicht-Szenen-Elementen wie Titelseite, Synopsis, Recap und Precap.
          Sie werden in der Drehbuchkoordination unter dem Tab <strong>Vorlagen</strong> verwaltet.
        </p>
        <h3 style={h3}>Vorlagen-Typen</h3>
        <ul style={{ ...p, paddingLeft: 20 }}>
          <li><strong>Titelseite</strong> — Deckblatt mit Produktions-Metadaten (Staffel, Block, Autor, Regie)</li>
          <li><strong>Synopsis</strong> — Zusammenfassung der Folge mit Figurennamen</li>
          <li><strong>Recap</strong> — Rückblick auf vorherige Handlung</li>
          <li><strong>Precap</strong> — Vorschau auf kommende Handlung</li>
          <li><strong>Benutzerdefiniert</strong> — Freie Vorlage für andere Zwecke</li>
        </ul>
        <h3 style={h3}>Meta-Platzhalter</h3>
        <p style={p}>
          Beim Erstellen einer Vorlage können Platzhalter eingefügt werden, die beim Einfügen durch echte Werte ersetzt werden:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {['{{autor}}', '{{block}}', '{{folge}}', '{{folgentitel}}', '{{staffel}}', '{{produktion}}', '{{datum}}', '{{fassung}}', '{{version}}'].map(k => (
            <code key={k} style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>{k}</code>
          ))}
        </div>
        <h3 style={h3}>Vorlagen im Editor</h3>
        <p style={p}>
          Wenn eine Notiz-Szene ausgewählt ist, zeigt der Editor-Header ein Dropdown <em>"Vorlage einfügen..."</em>.
          Bei Auswahl wird der Vorlagen-Inhalt in die Szene eingefügt. Manuelle Änderungen sind danach möglich.
        </p>
        <h3 style={h3}>Import-Erkennung</h3>
        <p style={p}>
          Beim PDF-Import erkennt die App automatisch Titelseiten, Synopsis, Recap und Precap aus der Dokumentstruktur.
          Diese werden als eigene Nicht-Szenen-Elemente mit eigener UUID importiert und in der Szenenübersicht angezeigt
          (Toggle: <em>"Alles anzeigen"</em> im Hamburger-Menü der Szenenleiste).
        </p>
        <h3 style={h3}>Produktion kopieren</h3>
        <p style={p}>
          Vorlagen können über <em>Drehbuchkoordination → Von Produktion kopieren → Dokument-Vorlagen</em> in eine neue Produktion übernommen werden.
        </p>
      </div>

      <div style={card}>
        <h2 style={h2}>PDF-Texterkennung (OCR)</h2>
        <p style={p}>
          Beim Import von PDF-Dateien stehen zwei Extraktionsmethoden zur Verfügung:
        </p>
        <h3 style={h3}>1. pdftotext (Standard)</h3>
        <p style={p}>
          Schnelle lokale Extraktion über Poppler. Funktioniert gut bei Textschicht-PDFs.
          Bei Zeilennummern am rechten Rand kann die Seitenbreite per Slider beschnitten werden (Standard: 85%).
        </p>
        <h3 style={h3}>2. Mistral OCR</h3>
        <p style={p}>
          KI-basierte Texterkennung über die Mistral-API (<code>mistral-ocr-latest</code>).
          Liefert bessere Ergebnisse bei gescannten PDFs oder komplexen Layouts.
          Erfordert einen aktiven Mistral API-Key in den Admin-Einstellungen.
        </p>
        <h3 style={h3}>Konfiguration</h3>
        <p style={p}>
          Der OCR-Toggle erscheint automatisch im Import-Wizard (Schritt 1), wenn in den
          <strong> Admin-Einstellungen</strong> (Admin → KI) ein Mistral-Provider mit API-Key aktiv ist
          und die Funktion <code>pdf_ocr</code> aktiviert wurde.
        </p>
        <div style={{ background: '#f8f9fa', borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
          <p style={{ ...p, margin: 0, fontSize: 12 }}>
            <strong>Hinweis:</strong> Mistral OCR sendet das PDF an die Mistral-API. Bei vertraulichen Dokumenten die lokale pdftotext-Methode verwenden.
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Werkstufen & Labels Tab ────────────────────────────────────────────────
function WerkstufenLabelsTab() {
  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 24 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 0 }
  const h3: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: C.muted, marginBottom: 12 }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.orange}18 0%, ${C.green}12 100%)`,
        border: `1px solid ${C.orange}33`,
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 32,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>🏷️</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Werkstufen & Fassungs-Labels</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Zwei komplementaere Konzepte: <strong>Werkstufen</strong> sind die konkreten Dokument-Container (der Text),
            waehrend <strong>Fassungs-Labels</strong> semantische Tags sind, die einer Werkstufe ihre Rolle im Produktions-Workflow zuweisen.
          </div>
        </div>
      </div>

      {/* ── 1. Werkstufen ── */}
      <div style={card}>
        <h2 style={h2}>1. Was ist eine Werkstufe?</h2>
        <p style={p}>
          Eine Werkstufe ist ein <strong>konkreter Dokumentcontainer</strong> — sie enthaelt den tatsaechlichen Text
          (ueber <code>dokument_szenen</code>). Jede Episode kann mehrere Werkstufen haben.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { label: 'Typ', desc: 'Was ist es?', value: 'drehbuch · storyline · notiz', color: C.orange },
            { label: 'Version', desc: 'Wie oft neu erstellt?', value: 'V1, V2, V3...', color: C.blue },
            { label: 'Sichtbarkeit', desc: 'Wer darf lesen?', value: 'privat · team · alle · colab', color: C.purple },
            { label: 'Status', desc: 'Bearbeitbar?', value: 'entwurf · gesperrt', color: C.green },
          ].map(f => (
            <div key={f.label} style={{ border: `1px solid ${f.color}33`, borderRadius: 8, padding: '10px 14px', background: f.color + '08' }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: f.color }}>{f.label}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.desc}</div>
              <code style={{ fontSize: 10, color: C.text }}>{f.value}</code>
            </div>
          ))}
        </div>

        <div style={{ background: '#000', borderRadius: 10, padding: '16px 20px', color: '#fff', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8 }}>
          <div style={{ color: '#888', marginBottom: 4 }}>// Analogie: Git</div>
          <div><span style={{ color: C.orange }}>Werkstufe</span>  = <span style={{ color: '#ccc' }}>Commit</span>  (konkreter Snapshot)</div>
          <div><span style={{ color: C.green }}>Label</span>      = <span style={{ color: '#ccc' }}>Tag</span>     (zeigt auf einen Commit)</div>
        </div>
      </div>

      {/* ── 2. Fassungs-Labels ── */}
      <div style={card}>
        <h2 style={h2}>2. Was ist ein Fassungs-Label?</h2>
        <p style={p}>
          Ein Fassungs-Label ist ein <strong>semantischer Tag</strong>, der einer Werkstufe zugewiesen wird und ihre
          Funktion im Produktionsworkflow beschreibt. Labels werden pro Produktion in der <strong>Drehbuchkoordination</strong> definiert.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {['Erstfassung', 'Redaktionsfassung', 'Drehfassung', 'Produktionsfassung'].map((l, i) => (
            <span key={l} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              background: i === 3 ? C.green + '20' : C.blue + '15',
              color: i === 3 ? C.green : C.blue,
              border: `1px solid ${i === 3 ? C.green : C.blue}44`,
            }}>
              {l}
              {i === 3 && <span style={{ fontSize: 9 }}>🔒</span>}
            </span>
          ))}
        </div>

        <p style={p}>
          Labels sind <strong>nicht fest</strong> — sie koennen wandern. Wenn eine neue Version erstellt wird,
          kann das Label „Drehfassung" von V2 auf V3 verschoben werden.
        </p>
      </div>

      {/* ── 3. Zusammenspiel ── */}
      <div style={card}>
        <h2 style={h2}>3. Zusammenspiel — Beispiel</h2>
        <div style={{
          background: '#f8f9fa', border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '16px 20px', fontFamily: 'monospace', fontSize: 12, lineHeight: 2,
        }}>
          <div style={{ color: C.muted, fontFamily: 'inherit', marginBottom: 8, fontWeight: 700 }}>Episode 4711</div>
          <div>├── <span style={{ color: C.orange }}>Drehbuch V1</span>  ← <Badge color={C.blue}>Erstfassung</Badge></div>
          <div>├── <span style={{ color: C.orange }}>Drehbuch V2</span>  ← <Badge color={C.blue}>Redaktionsfassung</Badge></div>
          <div>├── <span style={{ color: C.orange }}>Drehbuch V3</span>  ← <Badge color={C.green}>Drehfassung 🔒</Badge></div>
          <div>├── <span style={{ color: C.purple }}>Storyline V1</span>  <span style={{ color: C.muted }}>(kein Label)</span></div>
          <div>└── <span style={{ color: C.gray }}>Notiz V1</span>      <span style={{ color: C.muted }}>(kein Label)</span></div>
        </div>
      </div>

      {/* ── 4. Sichtbarkeiten ── */}
      <div style={card}>
        <h2 style={h2}>4. Sichtbarkeiten</h2>
        <p style={p}>
          Jede Werkstufe hat eine Sichtbarkeitsstufe. Diese bestimmt, wer das Dokument sehen und bearbeiten darf.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {['Stufe', 'Icon', 'Bedeutung', 'Typischer Einsatz'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { stufe: 'privat', icon: '🔒', color: '#FF9500', desc: 'Nur Ersteller sieht es', einsatz: 'Eigener Entwurf, Notizen' },
              { stufe: 'team', icon: '👥', color: '#007AFF', desc: 'Alle Autoren der Produktion', einsatz: 'Standard fuer Storylines & Drehbuecher' },
              { stufe: 'alle', icon: '🌐', color: '#00C853', desc: 'Alle Nutzer mit Produktionszugriff', einsatz: 'Finale Fassungen, Drehfassung' },
              { stufe: 'colab', icon: '👥✏️', color: '#AF52DE', desc: 'Echtzeit-Kollaboration (Yjs)', einsatz: 'Gemeinsames Schreiben, Writers Room' },
            ].map(r => (
              <tr key={r.stufe} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px' }}><code style={{ color: r.color, fontWeight: 600 }}>{r.stufe}</code></td>
                <td style={{ padding: '8px 10px', fontSize: 14 }}>{r.icon}</td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.desc}</td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.einsatz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 5. Produktionsfassung & Lock ── */}
      <div style={card}>
        <h2 style={h2}>5. Produktionsfassung & Lock-Mechanismus</h2>
        <p style={p}>
          In den DK-Settings kann ein Label als <strong>Produktionsfassung</strong> markiert werden (Checkbox „Produktionsfassung").
          Dieses Label hat eine besondere Wirkung:
        </p>
        <div style={{
          background: `linear-gradient(135deg, ${C.green}12 0%, ${C.green}05 100%)`,
          border: `1px solid ${C.green}44`,
          borderRadius: 10,
          padding: '16px 20px',
          marginBottom: 16,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.green, marginBottom: 8 }}>Was passiert beim Zuweisen?</div>
          <ol style={{ ...p, paddingLeft: 20, marginBottom: 0 }}>
            <li>Die Werkstufe erhaelt den <code>bearbeitung_status = 'gesperrt'</code></li>
            <li>Der Editor wird <strong>read-only</strong> — kein Bearbeiten mehr moeglich</li>
            <li>In der Szenenleiste erscheint ein Schloss-Icon</li>
            <li>Nur Nutzer mit der <em>Status-Override-Rolle</em> (konfigurierbar in Admin) koennen die Sperre aufheben</li>
          </ol>
        </div>
        <div style={{ background: '#fff8e1', border: '1px solid #ffcc0044', borderRadius: 8, padding: 12 }}>
          <p style={{ ...p, margin: 0, fontSize: 12 }}>
            <strong>Hinweis:</strong> Das Entfernen des Labels hebt die Sperre <em>nicht</em> automatisch auf.
            Der Status muss explizit in den Werkstufen-Einstellungen zurueckgesetzt werden.
          </p>
        </div>
      </div>

      {/* ── 6. Revisions-Farben & Rote Seiten ── */}
      <div style={card}>
        <h2 style={h2}>6. Revisions-Farben (Rote Seiten)</h2>
        <p style={p}>
          Jede Produktion definiert in der Drehbuchkoordination eine <strong>Farbsequenz</strong> fuer Revisionen,
          basierend auf dem WGA-Standard. Die Reihenfolge bestimmt, welche Farbe bei der naechsten Revision vergeben wird.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { name: 'Weisse Seiten', color: '#FFFFFF', border: true },
            { name: 'Blaue Seiten', color: '#A8D8EA' },
            { name: 'Pinke Seiten', color: '#FFAEC9' },
            { name: 'Gelbe Seiten', color: '#FFFFAA' },
            { name: 'Gruene Seiten', color: '#B5E7A0' },
            { name: 'Goldrute', color: '#FFD700' },
          ].map(c => (
            <div key={c.name} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px',
              borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: c.color,
              border: c.border ? `1px solid ${C.border}` : 'none',
              color: '#333',
            }}>
              {c.name}
            </div>
          ))}
        </div>

        <h3 style={h3}>Wie funktionieren Rote Seiten?</h3>
        <p style={p}>
          Wenn nach einer abgegebenen Fassung Aenderungen noetig sind, wird eine neue Werkstufe erstellt und automatisch
          die naechste Farbe in der Sequenz zugewiesen. Geaenderte Szenen erhalten im Export einen farbigen Seitenrand
          und ein <code>*</code> am rechten Rand jeder geaenderten Zeile (Revision Marks).
        </p>

        <div style={{ fontFamily: 'monospace', fontSize: 11, background: '#000', color: '#fff', borderRadius: 8, padding: '12px 16px', lineHeight: 1.8 }}>
          <div style={{ color: '#888' }}>// Revision-Sequenz</div>
          <div>Drehbuch V1 <span style={{ color: '#aaa' }}>→</span> Weisse Seiten (Original)</div>
          <div>Drehbuch V2 <span style={{ color: '#A8D8EA' }}>→</span> Blaue Seiten (1. Revision)</div>
          <div>Drehbuch V3 <span style={{ color: '#FFAEC9' }}>→</span> Pinke Seiten (2. Revision)</div>
          <div>Drehbuch V4 <span style={{ color: '#FFFFAA' }}>→</span> Gelbe Seiten (3. Revision)</div>
        </div>
      </div>

      {/* ── 7. Memo-Schwellwert ── */}
      <div style={card}>
        <h2 style={h2}>7. Memo-Seiten (kurze Aenderungen)</h2>
        <p style={p}>
          Nicht jede Aenderung rechtfertigt eine vollstaendige Replacement Page. In den DK-Settings kann ein
          <strong> Memo-Schwellwert</strong> (in Zeichen) gesetzt werden:
        </p>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Aenderung &gt; Schwellwert</div>
            <div style={{ fontSize: 12, color: C.muted }}>→ Vollstaendige <strong>Replacement Page</strong> im Export (neue Seite mit Revisionsfarbe)</div>
          </div>
          <div style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Aenderung ≤ Schwellwert</div>
            <div style={{ fontSize: 12, color: C.muted }}>→ Kompakte <strong>Memo-Zeile</strong> im Export (einzeilige Kurznotiz, kein Seitenwechsel)</div>
          </div>
        </div>
        <p style={p}>
          Standard: <code>100 Zeichen</code>. Konfigurierbar in <em>Drehbuchkoordination → Revisions-Export</em>.
        </p>
      </div>

      {/* ── 8. Wo konfigurieren? ── */}
      <div style={card}>
        <h2 style={h2}>8. Konfiguration — Wo finde ich was?</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {['Einstellung', 'Ort', 'Beschreibung'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { setting: 'Fassungs-Labels definieren', ort: 'DK → Fassungs-Labels', desc: 'Labels anlegen, Reihenfolge aendern, als Produktionsfassung markieren' },
              { setting: 'Label einer Werkstufe zuweisen', ort: 'Editor-Header → Tag-Icon', desc: 'Klick auf das Label-Chip neben der Versions-Anzeige' },
              { setting: 'Revisions-Farben', ort: 'DK → Revisions-Farben', desc: 'WGA-Farbsequenz anlegen, Reihenfolge bestimmt Revisionsreihenfolge' },
              { setting: 'Memo-Schwellwert', ort: 'DK → Revisions-Export', desc: 'Ab wieviel Zeichen eine Replacement Page statt Memo erzeugt wird' },
              { setting: 'Status-Override-Rolle', ort: 'Admin → Einstellungen', desc: 'Welche Rolle gesperrte Werkstufen entsperren darf' },
              { setting: 'Sichtbarkeit aendern', ort: 'Editor-Header → Badge', desc: 'Sichtbarkeitsstufe der aktuellen Werkstufe wechseln' },
            ].map(r => (
              <tr key={r.setting} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px', fontWeight: 500 }}>{r.setting}</td>
                <td style={{ padding: '8px 10px' }}><code style={{ fontSize: 11, background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>{r.ort}</code></td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 9. Workflow-Diagramm ── */}
      <div style={card}>
        <h2 style={h2}>9. Typischer Workflow</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { step: '1', label: 'Import', desc: 'PDF importieren → erstellt automatisch Folge + Werkstufe + Szenen', color: C.blue },
            { step: '2', label: 'Label zuweisen', desc: 'Im Editor-Header → „Erstfassung" als Label setzen', color: C.orange },
            { step: '3', label: 'Ueberarbeitung', desc: 'Neue Werkstufe erstellen (V2), Label „Redaktionsfassung" zuweisen', color: C.purple },
            { step: '4', label: 'Abgabe', desc: '„Drehfassung" zuweisen (Produktionsfassung) → Werkstufe wird gesperrt', color: C.green },
            { step: '5', label: 'Revision', desc: 'Neue Werkstufe (V3) mit naechster Revisionsfarbe, Aenderungen markiert', color: C.red },
          ].map((s, i) => (
            <div key={s.step} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', background: s.color,
                  color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                }}>
                  {s.step}
                </div>
                {i < 4 && <div style={{ width: 2, height: 24, background: C.border }} />}
              </div>
              <div style={{ paddingTop: 4, paddingBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default HilfePage
