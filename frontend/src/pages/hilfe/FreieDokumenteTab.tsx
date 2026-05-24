// ── Hilfe: Freie Dokumente ────────────────────────────────────────────────────

import { C, Badge, TableCard } from './_shared'

const H1 = ({ children }: { children: React.ReactNode }) => (
  <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px', color: C.text }}>{children}</h2>
)
const H2 = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 10px', color: C.text }}>{children}</h3>
)
const P = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => (
  <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: muted ? C.muted : C.text }}>{children}</p>
)
const Hint = ({ icon = '💡', children }: { icon?: string; children: React.ReactNode }) => (
  <div style={{
    display: 'flex', gap: 10, padding: '10px 14px',
    background: '#007AFF11', border: '1.5px solid #007AFF33',
    borderRadius: 8, fontSize: 13, lineHeight: 1.5,
    margin: '12px 0', color: C.text,
  }}>
    <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
    <span>{children}</span>
  </div>
)
const Warn = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    display: 'flex', gap: 10, padding: '10px 14px',
    background: '#FF950011', border: '1.5px solid #FF950033',
    borderRadius: 8, fontSize: 13, lineHeight: 1.5,
    margin: '12px 0', color: C.text,
  }}>
    <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
    <span>{children}</span>
  </div>
)
const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', margin: '8px 0' }}>
    <div style={{
      width: 24, height: 24, borderRadius: '50%',
      background: C.blue, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 700, flexShrink: 0,
    }}>{n}</div>
    <div style={{ fontSize: 14, lineHeight: 1.6, paddingTop: 2, color: C.text }}>{children}</div>
  </div>
)

const LABELS = [
  { value: 'schattenbuch',  label: 'Schattenbuch',  color: '#AF52DE', desc: 'Alternatives Drehbuch zu einer bestehenden Episode. Wird intern entwickelt, nicht als Sendungsfassung geplant.' },
  { value: 'casting_szene', label: 'Casting-Szene',  color: '#007AFF', desc: 'Szenen ausschließlich für Casting-Zwecke — kein Sendungsbezug, keine Episodenzuordnung.' },
  { value: 'spin_off',      label: 'Spin-Off',        color: '#FF9500', desc: 'Konzept oder Szenen für eine eigenständige Serienidee aus dem Hauptformat heraus.' },
  { value: 'sonstiges',     label: 'Sonstiges',       color: '#757575', desc: 'Allgemeines freies Dokument ohne spezifische Kategorie.' },
]

const SICHTBARKEIT = [
  { value: 'dauerhaft_privat', label: 'Privat',        icon: '🔒', color: '#FF3B30', desc: 'Nur du und Superadmins können dieses Dokument sehen und bearbeiten. Automatisches Aufheben des Privat-Modus ist deaktiviert.' },
  { value: 'team',             label: 'Team',           icon: '👥', color: '#007AFF', desc: 'Sichtbar für alle Nutzer mit Drehbuchkoordinations-Zugang (Standard).' },
  { value: 'alle',             label: 'Alle Autoren',   icon: '🌐', color: '#00C853', desc: 'Sichtbar für alle Autoren dieser Produktion.' },
]

export default function FreieDokumenteTab() {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>

      {/* ── User-Guide ─────────────────────────────────────────────────── */}
      <H1>Freie Dokumente</H1>
      <P muted>
        Schreibe Drehbücher und Szenen, die zu einer Produktion gehören — aber keiner bestimmten Folge zugeordnet sind.
      </P>

      <H2>Was sind Freie Dokumente?</H2>
      <P>
        Freie Dokumente sind vollwertige Drehbücher im Script-Editor, die mit deiner Produktion verknüpft sind,
        aber <strong>keine Folgennummer</strong> haben. Du benutzt denselben Editor, dieselben Werkstufen, Revisionen
        und Exportfunktionen wie bei normalen Episoden — der einzige Unterschied ist, dass das Dokument nicht
        an eine bestimmte Folge gebunden ist.
      </P>

      <Hint>
        Freie Dokumente sind ausschließlich in der Script-App sichtbar. Andere Apps (Live-Dispo, Vertragsdatenbank
        etc.) greifen nicht auf sie zu.
      </Hint>

      <H2>Dokumenttypen (Labels)</H2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {LABELS.map(l => (
          <div key={l.value} style={{
            display: 'flex', gap: 12, padding: '10px 14px',
            background: l.color + '11', border: `1.5px solid ${l.color}44`,
            borderRadius: 8, alignItems: 'flex-start',
          }}>
            <div>
              <span style={{
                display: 'inline-block', padding: '2px 10px', borderRadius: 99,
                background: l.color + '22', color: l.color,
                fontSize: 12, fontWeight: 700, marginBottom: 4,
              }}>{l.label}</span>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{l.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <H2>Neues freies Dokument anlegen</H2>
      <Step n={1}>Im App-Menü (Klick auf „script" oben links) auf <strong>Freie Dokumente</strong> klicken.</Step>
      <Step n={2}>Auf <strong>„Neues Dokument"</strong> klicken — der Erstellungs-Dialog öffnet sich.</Step>
      <Step n={3}>Einen <strong>Titel</strong> eingeben (z.&thinsp;B. „Schattenbuch Ep. 4290").</Step>
      <Step n={4}>Den <strong>Dokumenttyp</strong> wählen: Schattenbuch, Casting-Szene, Spin-Off oder Sonstiges.</Step>
      <Step n={5}>Die <strong>Sichtbarkeit</strong> festlegen (mehr dazu unten).</Step>
      <Step n={6}>Mit <strong>„Dokument anlegen"</strong> bestätigen. Der Editor öffnet sich sofort.</Step>

      <H2>Im Editor arbeiten</H2>
      <P>
        Das freie Dokument öffnet sich wie eine normale Episode — mit Szenenleiste, Editor, Werkstufen und
        Revisionen. Du kannst beliebig viele Szenen anlegen und mehrere Werkstufen (Entwurf, Fassung 2 etc.)
        verwalten. Alle Exportformate (PDF, FDX, Fountain) stehen zur Verfügung.
      </P>
      <P>
        In der Topbar siehst du statt Block/Folge-Selektor nur den Produktionsnamen und den Dokumenttitel.
        Über das App-Menü kannst du jederzeit zu den normalen Folgen zurückwechseln.
      </P>

      <H2>Sichtbarkeit</H2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {SICHTBARKEIT.map(s => (
          <div key={s.value} style={{
            display: 'flex', gap: 12, padding: '10px 14px',
            background: s.color + '11', border: `1.5px solid ${s.color}44`,
            borderRadius: 8, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>{s.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <Hint>
        Die Sichtbarkeit kann jederzeit manuell geändert werden. „Privat" bei freien Dokumenten bedeutet nur,
        dass kein automatischer Ablauf-Timer aktiv ist — anders als bei Werkstufen (siehe unten).
      </Hint>

      <H2>Mit einer Folge verknüpfen</H2>
      <P>
        Wenn du ein freies Dokument als Grundlage für eine echte Episode verwenden möchtest, kannst du es
        mit einer Folge verknüpfen:
      </P>
      <Step n={1}>In der Dokumentliste auf das Menü-Symbol (▼) neben dem Dokument klicken.</Step>
      <Step n={2}><strong>„Mit Folge verknüpfen"</strong> auswählen.</Step>
      <Step n={3}>Die Zielfolge aus dem Dropdown auswählen.</Step>
      <Step n={4}>Optional: „Als Folge für Sendung markieren" aktivieren.</Step>
      <Step n={5}>Mit <strong>„Verknüpfen"</strong> bestätigen.</Step>

      <Hint icon="📋">
        Die Szenen werden in eine neue Werkstufe der Zielfolge <strong>kopiert</strong> — das freie Dokument
        bleibt als Archiv erhalten und kann weiterhin bearbeitet werden.
      </Hint>

      <H2>Dokument löschen</H2>
      <P>
        Nur der Ersteller eines Dokuments (oder Superadmins) kann es löschen. Beim Löschen werden alle
        Werkstufen und Szenen dauerhaft entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
      </P>

      {/* ── Admin-Sektion ──────────────────────────────────────────────── */}
      <div style={{ marginTop: 48, paddingTop: 32, borderTop: `2px solid ${C.border}` }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', background: '#FF3B3022', color: '#FF3B30',
          borderRadius: 99, fontSize: 11, fontWeight: 700, marginBottom: 16,
        }}>
          🔒 ADMIN-DOKUMENTATION
        </div>
        <H1>Technische Architektur</H1>
        <P muted>
          Freie Dokumente nutzen <strong>keine eigene Tabelle</strong> — sie werden direkt als
          Einträge in der bestehenden <code>folgen</code>-Tabelle mit <code>ist_frei = true</code> gespeichert.
          Alle anderen Infrastrukturkomponenten (werkstufen, dokument_szenen, scene_identities, Revisionen,
          Export, Kollaboration) werden unverändert wiederverwendet.
        </P>

        <H2>Datenbankstruktur (Migration v117)</H2>
        <TableCard
          title="folgen"
          color={C.blue}
          note="Neue Felder in v117 — alle bestehenden Felder bleiben unverändert"
          fields={[
            { name: 'ist_frei',          type: 'BOOLEAN', desc: 'true = freies Dokument (kein folge_nummer), false = normale Episode' },
            { name: 'folge_nummer',      type: 'INT NULL', desc: 'Jetzt nullable (war NOT NULL). NULL wenn ist_frei=true.' },
            { name: 'dokument_label',    type: 'TEXT',    desc: "schattenbuch | casting_szene | spin_off | sonstiges | folge_sendung (Default für normale Episoden)" },
            { name: 'sichtbarkeit_frei', type: 'TEXT',    desc: "dauerhaft_privat | team | alle (nur relevant wenn ist_frei=true)" },
            { name: 'ersteller_user_id', type: 'TEXT',    desc: 'user_id des Erstellers — für dauerhaft_privat-Enforcement' },
          ]}
        />

        <H2>Label-Auswirkungen</H2>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: C.text }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: C.muted }}>Label</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: C.muted }}>DB-Wert</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: C.muted }}>Wann gesetzt</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Schattenbuch',  val: 'schattenbuch',  when: 'Manuell beim Erstellen / Bearbeiten freier Dokumente' },
                { label: 'Casting-Szene', val: 'casting_szene', when: 'Manuell beim Erstellen / Bearbeiten freier Dokumente' },
                { label: 'Spin-Off',      val: 'spin_off',      when: 'Manuell beim Erstellen / Bearbeiten freier Dokumente' },
                { label: 'Sonstiges',     val: 'sonstiges',     when: 'Manuell (Default für freie Dokumente)' },
                { label: 'Folge für Sendung', val: 'folge_sendung', when: 'Auto (Default für normale Episoden) oder optional beim Verknüpfen' },
              ].map(row => (
                <tr key={row.val} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600 }}>{row.label}</td>
                  <td style={{ padding: '6px 8px' }}><code style={{ fontSize: 11, color: C.blue }}>{row.val}</code></td>
                  <td style={{ padding: '6px 8px', color: C.muted }}>{row.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <H2>Sichtbarkeits-Enforcement (Server-Side)</H2>
        <P>
          Der Server erzwingt die Sichtbarkeitsregeln — nicht das Frontend:
        </P>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: C.text, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div style={{ padding: '8px 12px', background: '#FF3B3011', borderRadius: 6, border: '1px solid #FF3B3033' }}>
            <strong>dauerhaft_privat</strong>: <code>GET /api/v2/folgen?nur_frei=true</code> filtert auf
            <code> ersteller_user_id = user_id OR role = 'superadmin'</code>. Andere Nutzer sehen das Dokument
            nicht — weder in der Liste noch im Editor (403/404).
          </div>
          <div style={{ padding: '8px 12px', background: '#007AFF11', borderRadius: 6, border: '1px solid #007AFF33' }}>
            <strong>team / alle</strong>: Derzeit keine weitere serverseitige Unterscheidung — beide Werte machen
            das Dokument für alle mit DK-Zugang sichtbar. Die Unterscheidung „alle" vs. „team" ist für zukünftige
            granulare Zugriffssteuerung vorgesehen.
          </div>
        </div>

        <H2>API-Endpunkte</H2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {[
            { method: 'GET',    path: '/api/v2/folgen?produktion_id=X&nur_frei=true', desc: 'Alle freien Dokumente der Produktion (sichtbarkeits-gefiltert)' },
            { method: 'POST',   path: '/api/v2/folgen',                               desc: 'Freies Dokument anlegen (Body: { ist_frei: true, folgen_titel, dokument_label, sichtbarkeit_frei })' },
            { method: 'PUT',    path: '/api/v2/folgen/:id',                           desc: 'Titel/Label/Sichtbarkeit ändern (dauerhaft_privat-Check)' },
            { method: 'DELETE', path: '/api/v2/folgen/:id',                           desc: 'Nur freie Dokumente, nur Ersteller/Superadmin' },
            { method: 'POST',   path: '/api/v2/folgen/:id/verknuepfe-mit-folge',      desc: 'Szenen in Zielfolge kopieren (neue Werkstufe)' },
          ].map(ep => (
            <div key={ep.path} style={{
              display: 'flex', gap: 8, alignItems: 'flex-start',
              padding: '8px 12px', background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: 6,
            }}>
              <Badge color={ep.method === 'GET' ? C.blue : ep.method === 'POST' ? C.green : ep.method === 'PUT' ? C.orange : C.red}>
                {ep.method}
              </Badge>
              <div>
                <code style={{ fontSize: 11, color: C.blue, display: 'block', marginBottom: 3 }}>{ep.path}</code>
                <span style={{ fontSize: 12, color: C.muted }}>{ep.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <H2>Sichtbarkeits-Enforcement (Korrektur: kein Auto-Ablauf)</H2>
        <P>
          Bei freien Dokumenten gibt es <strong>keinen automatischen Privat-Modus-Ablauf</strong>.
          Der Worker (siehe unten) greift ausschließlich auf <code>werkstufen.sichtbarkeit</code> zu —
          nicht auf <code>folgen.sichtbarkeit_frei</code>. Deshalb wird <code>dauerhaft_privat</code> im UI
          als „Privat" angezeigt: es gibt nur eine Art von Privat, und die hat per Design keinen Timer.
        </P>

        <H2>DK Glossar Defaults (v117)</H2>
        <P>
          In Migration v117 wurden drei neue Einträge in <code>dk_glossar_defaults</code> eingefügt:
          <strong> Schattenbuch</strong>, <strong>Casting-Szene</strong> und <strong>Spin-Off</strong> —
          alle mit <code>kategorie = 'kuerzel'</code>. Diese erscheinen automatisch im DK-Glossar aller
          Produktionen.
        </P>

        <H2>Frontend-Integration</H2>
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
          <ul style={{ paddingLeft: 20, margin: '0 0 16px' }}>
            <li><strong>Route</strong>: <code>/freie-dokumente</code> → <code>FreieDokumentePage.tsx</code></li>
            <li><strong>Editor öffnen</strong>: Navigation zu <code>/?freidok_id=&lt;folge.id&gt;</code></li>
            <li><strong>ScriptPage</strong>: liest <code>freidok_id</code> URL-Param, setzt <code>freiDokId</code> State, lädt Werkstufen direkt (bypassed folgeNummer-Lookup)</li>
            <li><strong>AppShell</strong>: <code>freiDokTitel</code>-Prop blendet Block/Folge-Selektor aus, zeigt stattdessen Dokumenttitel im Breadcrumb</li>
            <li><strong>DockedEditorPanels</strong>: <code>freiDokFolgeId</code>-Prop verwendet folge_id direkt statt Auflösung via folgeNummer</li>
          </ul>
        </div>
      </div>

      {/* ── Privat-Modus Worker ──────────────────────────────────────────── */}
      <div style={{ marginTop: 48, paddingTop: 32, borderTop: `2px solid ${C.border}` }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', background: '#007AFF22', color: '#007AFF',
          borderRadius: 99, fontSize: 11, fontWeight: 700, marginBottom: 16,
        }}>
          ⚙️ SYSTEM-DOKUMENTATION
        </div>
        <H1>Wie der automatische Privat-Modus-Ablauf bei Werkstufen funktioniert</H1>
        <P muted>
          Dieser Mechanismus gilt <strong>nur für Werkstufen</strong> — nicht für freie Dokumente
          und nicht für <code>folgen.sichtbarkeit_frei</code>.
        </P>

        <H2>Bedingung</H2>
        <P>
          Der Worker prüft alle 15 Minuten, ob alle drei Kriterien gleichzeitig erfüllt sind:
        </P>
        <div style={{ fontFamily: 'monospace', fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: 16, lineHeight: 1.8 }}>
          WHERE w.sichtbarkeit = 'privat'<br />
          {'  '}AND w.privat_permanent = false<br />
          {'  '}AND (keine aktive Session<br />
          {'  '}{'  '}OR last_active_at &lt; now() - X hours)
        </div>

        <H2>Ablauf</H2>
        <Step n={1}>
          <strong>Schwellwert lesen</strong> — <code>app_settings.privat_modus_ablauf_stunden</code> (default: 4 h).
          Konfigurierbar im Admin-Bereich.
        </Step>
        <Step n={2}>
          <strong>Inaktivitäts-Check</strong> — Wenn der Autor, der Privat aktiviert hat
          (<code>privat_gesetzt_von</code>), keinen aktiven Heartbeat in der
          <code> werkstufen_sessions</code>-Tabelle hat (oder überhaupt keine Session),
          gilt die Werkstufe als „abgelaufen".
        </Step>
        <Step n={3}>
          <strong>Tokens generieren</strong> — Zwei One-Click-Tokens (48 h gültig, kein Login nötig):
          <em> verlaengern</em> verlängert den Privat-Modus;
          <em> freigeben</em> setzt Sichtbarkeit auf den vorherigen Wert zurück (<code>previous_sichtbarkeit</code>).
        </Step>
        <Step n={4}>
          <strong>E-Mail an den Autor</strong> — Via auth.app-API wird die E-Mail-Adresse geholt, dann
          geht eine Mail mit zwei Buttons raus. Wenn bereits 2 unbenutzte Tokens existieren → Mail wurde
          schon gesendet, kein Doppelversand.
        </Step>
        <Step n={5}>
          <strong>Fallback (kein E-Mail-Empfänger)</strong> — Wenn die E-Mail-Adresse nicht ermittelbar ist,
          wird die Werkstufe sofort freigegeben
          (Sichtbarkeit → <code>previous_sichtbarkeit || 'autoren'</code>).
        </Step>

        <Hint>
          <strong>Bei freien Dokumenten</strong>: <code>folgen.sichtbarkeit_frei</code> wird vom Worker
          nie angefasst. Es gibt keine Session-Tabelle für freie Dokumente, keinen Heartbeat, keine Tokens.
          Deshalb gibt es dort kein <em>privat</em> vs. <em>dauerhaft_privat</em> — es gibt nur eine Art
          von „Privat", die per Design permanent ist.
        </Hint>

        <H2>Technische Details</H2>
        <TableCard
          title="Relevante Tabellen"
          color={C.blue}
          fields={[
            { name: 'werkstufen.sichtbarkeit',      type: "TEXT", desc: "'privat' = aktiv, 'autoren'/'team'/... = freigegeben" },
            { name: 'werkstufen.privat_permanent',  type: 'BOOLEAN', desc: 'false = Worker aktiv; true = Worker überspringt diese Werkstufe' },
            { name: 'werkstufen.privat_gesetzt_von',type: 'TEXT',    desc: 'user_id des Autors, der Privat aktiviert hat' },
            { name: 'werkstufen.previous_sichtbarkeit', type: 'TEXT', desc: 'Sichtbarkeit vor dem Privat-Modus (für Wiederherstellung)' },
            { name: 'werkstufen_sessions.last_active_at', type: 'TIMESTAMPTZ', desc: 'Letzter Heartbeat des Autors' },
            { name: 'privat_mode_tokens',           type: 'TABLE',   desc: 'One-Click-Tokens (verlaengern / freigeben), 48h gültig' },
            { name: 'app_settings.privat_modus_ablauf_stunden', type: 'TEXT', desc: 'Konfigurierter Ablauf-Schwellwert (default: 4)' },
          ]}
        />
      </div>
    </div>
  )
}
