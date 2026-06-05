import { useState } from 'react'
import { C, Badge, Section, InfoBox, WarnBox, FaqItem, TableCard, Arrow } from '../hilfe/_shared'

// ── Internes Tab-System ────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'uebersicht',   label: 'Übersicht' },
  { id: 'import',       label: 'PDF-Import' },
  { id: 'datenstruktur', label: 'Datenstruktur & Admin' },
]

// ── Übersicht-Tab ──────────────────────────────────────────────────────────────

function UebersichtTab() {
  return (
    <div>
      <Section title="Konzept & Planung — Wozu dient dieser Bereich?">
        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 16 }}>
          Der <strong>Konzept-Bereich</strong> ist der strategische Layer über dem Szenen-Editor.
          Hier werden Story-Strukturen geplant, importiert und analysiert — ohne den laufenden
          Schreibprozess zu stören.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            {
              icon: '🗂️', label: 'Future-Board', color: C.blue,
              desc: 'Kanban-artige Ansicht der Story-Stränge über zukünftige Blöcke. Beats werden als Karten dargestellt und können neu angeordnet werden.',
            },
            {
              icon: '🎭', label: 'Rollen-Einsatz', color: C.purple,
              desc: 'Matrix-Ansicht: Welche Figur tritt in welchem Block/Folge auf? Basis für Besetzungsplanung und Vertragsmanagement.',
            },
            {
              icon: '📖', label: 'Bible', color: C.orange,
              desc: 'Serieninterne Wissensdatenbank: Figuren-Steckbriefe, Handlungsorte, Hintergrundgeschichten — das kollektive Gedächtnis der Serie.',
            },
            {
              icon: '📋', label: 'Versionen', color: C.gray,
              desc: 'Übersicht aller Werkstufen und ihrer Status pro Folge. Zeigt welche Fassungen freigegeben, gesperrt oder in Bearbeitung sind.',
            },
            {
              icon: '📥', label: 'Import', color: C.green,
              desc: '3-Tier PDF-Import-System: Lädt ein Behandlungs-PDF hoch und extrahiert automatisch Story-Stränge und ihre Beats via KI.',
            },
            {
              icon: '⚠️', label: 'Befunde', color: C.red,
              desc: 'Automatisch erkannte Qualitätsprobleme (Cast-Lücken, Kontinuitätsfehler, strukturelle Schwächen) aus dem KI-Analyse-Bereich.',
            },
          ].map(item => (
            <div key={item.id} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              background: C.surface, borderRadius: 8,
              border: `1px solid ${item.color}33`,
              borderLeft: `3px solid ${item.color}`,
            }}>
              <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1.3 }}>{item.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: item.color, marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tastaturkürzel">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { key: 'Alt+2', desc: 'Konzept-Bereich öffnen' },
            { key: 'Alt+H', desc: 'Diese Hilfe-Seite öffnen' },
            { key: 'Alt+1', desc: 'Script-Bereich (Szenen-Editor)' },
            { key: 'Alt+3', desc: 'Analyse-Bereich' },
          ].map(k => (
            <div key={k.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <kbd style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                background: '#000', color: '#fff', fontSize: 11, fontFamily: 'monospace',
                fontWeight: 600, flexShrink: 0,
              }}>{k.key}</kbd>
              <span style={{ fontSize: 12, color: C.muted }}>{k.desc}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Import-Tab ─────────────────────────────────────────────────────────────────

function ImportTab() {
  return (
    <div>
      <Section title="Was ist der PDF-Import?">
        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 12 }}>
          Mit dem PDF-Import können Behandlungs-PDFs (Storylines, Strangpläne) direkt in das
          Story-Strang-System übertragen werden. Die KI erkennt Stränge und ihre Beats automatisch —
          ohne manuelles Eintippen.
        </p>
        <InfoBox title="Typischer Anwendungsfall">
          Das Autorenteam liefert einen neuen Strangplan als PDF. Statt die Beats von Hand einzupflegen,
          wird das PDF importiert, KI extrahiert alle Stränge und Beats, und sie können direkt auf dem
          Future-Board weiterbearbeitet werden.
        </InfoBox>
      </Section>

      <Section title="3-Stufen-Prozess im Detail">

        {/* Tier 1 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', background: C.green,
              color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>1</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Upload &amp; Schnell-Erkennung (Tier 1)</div>
            <Badge color={C.green}>kostenlos</Badge>
          </div>
          <div style={{
            padding: '12px 16px', background: C.surface, borderRadius: 8,
            border: `1px solid ${C.green}33`, fontSize: 12, color: C.muted, lineHeight: 1.65,
          }}>
            <p style={{ margin: '0 0 8px 0' }}>
              Das PDF wird hochgeladen und der Text extrahiert. Danach läuft eine <strong>Regex-basierte
              Erkennung</strong>: Wenn das Dokument klare Muster enthält (z.B. Strang-Überschriften,
              BLOCK-Markierungen), werden Stränge und Beats direkt identifiziert.
            </p>
            <p style={{ margin: 0 }}>
              <strong>Ergebnis:</strong> Status wechselt zu <Badge color={C.green}>done</Badge> — der
              Import kann sofort commited werden.
            </p>
          </div>
        </div>

        <Arrow label="Tier 1 erfolglos → weiter mit Tier 2" />

        {/* Tier 2 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', background: C.orange,
              color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>2</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>KI-Strukturerkennung (Tier 2)</div>
            <Badge color={C.orange}>~0,10 €</Badge>
          </div>
          <div style={{
            padding: '12px 16px', background: C.surface, borderRadius: 8,
            border: `1px solid ${C.orange}33`, fontSize: 12, color: C.muted, lineHeight: 1.65,
          }}>
            <p style={{ margin: '0 0 8px 0' }}>
              Ein <strong>KI-Aufruf</strong> analysiert die Dokument-Struktur und entscheidet, ob eine
              Chunk-weise Extraktion möglich ist. Diese Stufe prüft das Format und schätzt die Kosten für
              Tier 3.
            </p>
            <p style={{ margin: 0 }}>
              Auf der Import-Seite erscheint eine <strong>Kostenvorschau</strong> mit der Anzahl der
              Chunks bevor Tier 3 startet.
            </p>
          </div>
        </div>

        <Arrow label="Tier 2 erkannte Struktur → weiter mit Tier 3" />

        {/* Tier 3 */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', background: C.purple,
              color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>3</span>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Chunk-Extraktion (Tier 3)</div>
            <Badge color={C.purple}>variabel (~0,05–0,50 € pro Chunk)</Badge>
          </div>
          <div style={{
            padding: '12px 16px', background: C.surface, borderRadius: 8,
            border: `1px solid ${C.purple}33`, fontSize: 12, color: C.muted, lineHeight: 1.65,
          }}>
            <p style={{ margin: '0 0 8px 0' }}>
              Das Dokument wird in <strong>Abschnitte (Chunks)</strong> aufgeteilt. Für jeden Chunk ruft
              die KI alle enthaltenen Stränge und Beats aus — mit Folge-Zuordnung und Inhalt.
            </p>
            <p style={{ margin: 0 }}>
              Der Fortschrittsbalken zeigt: <em>Chunk X von Y verarbeitet</em>.
              Nach Abschluss aller Chunks → Status <Badge color={C.green}>done</Badge>.
            </p>
          </div>
        </div>

      </Section>

      <Section title="Commit: Stränge in die Datenbank schreiben">
        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 12 }}>
          Nach dem Import (Status <Badge color={C.green}>done</Badge>) erscheint der <strong>Commit-Dialog</strong>.
          Vor dem eigentlichen Schreiben kann eine Vorschau geprüft werden:
          welche Stränge werden angelegt, welche Beats ergänzt.
        </p>

        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <div style={{
            padding: '12px 14px', background: C.surface, borderRadius: 8,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              Overwrite-Schutz (Standard: AN)
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Beats, die bereits Inhalt haben, werden <strong>übersprungen</strong> —
              handgeschriebene Inhalte gehen nie verloren.
              Die Commit-Vorschau zeigt <em>X übersprungene Beats</em>.
            </div>
          </div>
          <div style={{
            padding: '12px 14px', background: C.surface, borderRadius: 8,
            border: `1px solid ${C.red}33`,
            borderLeft: `3px solid ${C.red}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 4 }}>
              Alles überschreiben (Checkbox)
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Aktiviert nur wenn bestehende Beats bewusst überschrieben werden sollen.
              Zeigt eine rote Warnung. Alle Beats — auch bisher bearbeitete — werden durch
              die importierten Werte ersetzt.
            </div>
          </div>
        </div>

        <WarnBox title="Nach dem Commit">
          Der Import-Job bleibt in der Liste erhalten (zum Nachvollziehen). Die erstellten
          Story-Stränge und Beats sind sofort auf dem <strong>Future-Board</strong> sichtbar.
        </WarnBox>
      </Section>

      <Section title="Häufige Fragen">
        <FaqItem
          q="Das PDF wird nicht erkannt (Status: error)"
          a={
            <p style={{ margin: 0 }}>
              Manche PDFs haben Text-Encoding-Probleme oder sind gescannt (Bild-PDF). Bitte sicherstellen,
              dass das PDF kopierbaren Text enthält (Test: Text im PDF markierbar?).
              Bei Bild-PDFs hilft OCR vorab (z.B. Adobe Acrobat oder Online-Tools).
            </p>
          }
        />
        <FaqItem
          q="Tier 2 startet nicht automatisch"
          a={
            <p style={{ margin: 0 }}>
              Tier 2 muss manuell über die „KI-Erkennung starten"-Schaltfläche ausgelöst werden.
              So kann die Kostenvorschau geprüft werden bevor KI-Kosten entstehen.
            </p>
          }
        />
        <FaqItem
          q="Ein Strang aus dem Import hat einen anderen Namen als der bestehende"
          a={
            <p style={{ margin: 0 }}>
              Nach einem ersten Commit wird eine <code>committed_strang_map</code> gespeichert,
              die Original-Import-Namen auf Datenbank-UUIDs mappt. Bei Re-Import wird diese Map
              verwendet — Umbenennungen im System werden also automatisch berücksichtigt.
            </p>
          }
        />
        <FaqItem
          q="Kann ich denselben Import mehrmals commiten?"
          a={
            <p style={{ margin: 0 }}>
              Ja. Dank Overwrite-Schutz werden nur neue/leere Beats hinzugefügt.
              Ein erneutes Commit erstellt <strong>keine</strong> doppelten Stränge.
            </p>
          }
        />
      </Section>
    </div>
  )
}

// ── Datenstruktur-Tab ──────────────────────────────────────────────────────────

function DatenstrukturTab() {
  return (
    <div>
      <InfoBox title="Admin-Bereich" color={C.gray}>
        Dieser Tab richtet sich an Administratoren und Entwickler. Er beschreibt die
        Datenbank-Tabellen, Status-Maschine und KI-Konfiguration des Import-Systems.
      </InfoBox>

      <Section title="Datenbank-Tabellen">

        <TableCard
          title="import_jobs"
          color={C.blue}
          note="Ein Job pro Upload-Vorgang. Bleibt nach dem Commit erhalten (Audit Trail)."
          fields={[
            { name: 'id', type: 'UUID PK', desc: 'Eindeutige Job-ID' },
            { name: 'produktion_id', type: 'UUID FK', desc: 'Verknüpfte Produktion' },
            { name: 'status', type: 'TEXT', desc: 'running | detecting | chunking | done | error' },
            { name: 'tier_erreicht', type: 'INT NULL', desc: 'Bis zu welchem Tier der Job verarbeitet wurde (1–3)' },
            { name: 'source_file_name', type: 'TEXT', desc: 'Original-Dateiname des hochgeladenen PDFs' },
            { name: 'source_file_path', type: 'TEXT', desc: 'Pfad zur gespeicherten Datei auf dem Server' },
            { name: 'extracted_text', type: 'TEXT NULL', desc: 'Volltext aus dem PDF (nach Tier 1)' },
            { name: 'ergebnis_json', type: 'JSONB NULL', desc: 'Extrahierte Stränge/Beats + committed_strang_map nach Commit' },
            { name: 'total_chunks', type: 'INT NULL', desc: 'Gesamtzahl Chunks (nach Tier 2)' },
            { name: 'done_chunks', type: 'INT NULL', desc: 'Verarbeitete Chunks (Fortschritt Tier 3)' },
            { name: 'committed_at', type: 'TIMESTAMPTZ NULL', desc: 'Zeitstempel des letzten Commits' },
            { name: 'committed_strands', type: 'INT NULL', desc: 'Anzahl Stränge beim letzten Commit' },
            { name: 'committed_beats', type: 'INT NULL', desc: 'Anzahl Beats (inkl. übersprungener) beim letzten Commit' },
            { name: 'fehler', type: 'TEXT NULL', desc: 'Fehlermeldung bei status=error' },
          ]}
        />

        <div style={{ marginTop: 16 }} />

        <TableCard
          title="straenge"
          color={C.purple}
          note="Zentrale Story-Strang-Tabelle. Wird beim Import-Commit befüllt oder manuell angelegt."
          fields={[
            { name: 'id', type: 'UUID PK', desc: 'Strang-ID' },
            { name: 'produktion_id', type: 'UUID FK', desc: 'Produktion' },
            { name: 'name', type: 'TEXT', desc: 'Strang-Name (z.B. "Lüneburg-Crime", "Eva-Roman")' },
            { name: 'arc_typ', type: 'TEXT', desc: 'soap | genre | anthology' },
            { name: 'label', type: 'TEXT NULL', desc: 'business | privat | null' },
            { name: 'farbe', type: 'TEXT NULL', desc: 'CSS-Farbe für Visualisierung' },
            { name: 'sortierung', type: 'INT', desc: 'Anzeigereihenfolge' },
            { name: 'erstellt_am', type: 'TIMESTAMPTZ', desc: 'Erstellungszeitpunkt' },
          ]}
        />

        <div style={{ marginTop: 16 }} />

        <TableCard
          title="strang_beats"
          color={C.orange}
          note="Einzelne Beats pro Strang und Folge. N:M über (strang_id, folge_nr) — max. 1 Beat pro Kombination."
          fields={[
            { name: 'id', type: 'UUID PK', desc: 'Beat-ID' },
            { name: 'strang_id', type: 'UUID FK', desc: 'Zugehöriger Strang' },
            { name: 'folge_nr', type: 'INT', desc: 'Folge-Nummer' },
            { name: 'inhalt', type: 'TEXT NULL', desc: 'Beschreibung des Beats (was passiert in dieser Folge)' },
            { name: 'parent_beat_id', type: 'UUID NULL', desc: 'Übergeordneter Beat (für Future-Beats pro Block)' },
            { name: 'beat_ebene', type: 'TEXT', desc: 'folge | block | future' },
            { name: 'sortierung', type: 'INT', desc: 'Anzeigereihenfolge innerhalb des Strangs' },
            { name: 'erstellt_am', type: 'TIMESTAMPTZ', desc: 'Erstellungszeitpunkt' },
          ]}
        />

      </Section>

      <Section title="Status-Maschine">
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          Jeder Import-Job durchläuft folgende Status-Übergänge:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { from: null, to: 'running', label: 'Upload gestartet', color: C.blue },
            { from: 'running', to: 'done', label: 'Tier 1 erfolgreich (Regex-Erkennung)', color: C.green },
            { from: 'running', to: 'detecting', label: 'Tier 1 erfolglos → warte auf Tier 2', color: C.orange },
            { from: 'detecting', to: 'chunking', label: 'Tier 2 abgeschlossen (Struktur erkannt)', color: C.purple },
            { from: 'chunking', to: 'running', label: 'Tier 3 gestartet (Chunk-Verarbeitung)', color: C.blue },
            { from: 'running', to: 'done', label: 'Alle Chunks verarbeitet', color: C.green },
            { from: '*', to: 'error', label: 'Fehler auf irgendeiner Stufe', color: C.red },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {t.from && (
                <Badge color={t.from === '*' ? C.gray : C.blue}>{t.from}</Badge>
              )}
              {t.from && <span style={{ color: C.muted, fontSize: 12 }}>→</span>}
              <Badge color={t.color}>{t.to}</Badge>
              <span style={{ fontSize: 11, color: C.muted }}>{t.label}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="committed_strang_map (Rename-Stabilität)">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          Nach einem erfolgreichen Commit wird in <code>ergebnis_json.committed_strang_map</code>
          eine Mapping-Tabelle gespeichert:
        </p>
        <div style={{
          background: '#111', color: '#e6db74', padding: '12px 16px',
          borderRadius: 8, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8,
          overflowX: 'auto', marginBottom: 12,
        }}>
          {`"committed_strang_map": {
  "Lüneburg-Crime": "uuid-1234...",
  "Eva-Roman":      "uuid-5678...",
  "Konrad-Arbeit":  "uuid-9abc..."
}`}
        </div>
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          Bei einem Re-Import (Commit desselben Jobs erneut) löst das Backend Strang-Namen
          zuerst über diese Map auf — <em>bevor</em> es per DB-Name-Suche geht. Damit überleben
          Umbenennungen im System (z.B. "Eva-Roman" → "Eva & Konrad") den erneuten Commit ohne Duplikate.
        </p>
      </Section>

      <Section title="KI-Konfiguration">
        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 12 }}>
          KI-Einstellungen für den Import-Prozess werden über den Admin-Bereich
          (<strong>Admin → KI-Einstellungen</strong>) gesteuert:
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            { key: 'import_tier2_provider', desc: 'KI-Provider für Tier-2-Strukturerkennung (empfohlen: mistral-cloud)' },
            { key: 'import_tier3_provider', desc: 'KI-Provider für Tier-3-Chunk-Extraktion (empfohlen: mistral-cloud)' },
          ].map(item => (
            <div key={item.key} style={{
              display: 'flex', gap: 10, padding: '8px 12px',
              background: C.surface, borderRadius: 6, border: `1px solid ${C.border}`,
              alignItems: 'flex-start',
            }}>
              <code style={{ fontSize: 11, color: C.blue, fontWeight: 600, flexShrink: 0, lineHeight: 1.6 }}>{item.key}</code>
              <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>{item.desc}</span>
            </div>
          ))}
        </div>
        <WarnBox title="Ollama-Timeout">
          Ollama hat einen Timeout von 600s. Für zeitkritische Imports (lange Dokumente) wird
          <strong> Mistral Cloud</strong> empfohlen. Immer einen Regex-/Heuristik-Fallback vorsehen.
        </WarnBox>
      </Section>

      <Section title="API-Endpunkte">
        <div style={{ display: 'grid', gap: 6 }}>
          {[
            { method: 'POST', path: '/api/import-jobs/upload', desc: 'PDF hochladen, Job anlegen + Tier 1 starten' },
            { method: 'GET', path: '/api/import-jobs', desc: 'Alle Jobs der aktuellen Produktion' },
            { method: 'GET', path: '/api/import-jobs/:id', desc: 'Einzelnen Job abrufen (inkl. ergebnis_json)' },
            { method: 'DELETE', path: '/api/import-jobs/:id', desc: 'Job löschen (inkl. Datei auf Disk)' },
            { method: 'GET', path: '/api/import-jobs/:id/file', desc: 'Original-PDF herunterladen' },
            { method: 'POST', path: '/api/import-jobs/:id/tier2', desc: 'Tier 2 manuell starten' },
            { method: 'GET', path: '/api/import-jobs/:id/cost-preview', desc: 'Kostenvorschau für Tier 3' },
            { method: 'POST', path: '/api/import-jobs/:id/tier3', desc: 'Tier 3 starten (Chunk-Extraktion)' },
            { method: 'GET', path: '/api/import-jobs/:id/commit-preview', desc: 'Vorschau: was wird beim Commit angelegt?' },
            { method: 'POST', path: '/api/import-jobs/:id/commit', desc: 'Extrahierte Stränge/Beats in DB schreiben' },
          ].map(ep => (
            <div key={ep.path} style={{
              display: 'flex', gap: 8, alignItems: 'baseline',
              padding: '6px 10px', background: C.surface, borderRadius: 6,
              border: `1px solid ${C.border}`, fontSize: 11,
            }}>
              <span style={{
                fontFamily: 'monospace', fontWeight: 700, flexShrink: 0,
                color: ep.method === 'GET' ? C.blue : ep.method === 'POST' ? C.green : C.red,
              }}>{ep.method}</span>
              <code style={{ color: C.text, flexShrink: 0 }}>{ep.path}</code>
              <span style={{ color: C.muted }}>{ep.desc}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

// ── Haupt-Komponente ────────────────────────────────────────────────────────────

export default function PlanungsHilfePage() {
  const [activeSection, setActiveSection] = useState('uebersicht')

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* Linke Navigation */}
      <div style={{
        width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--bg-surface)', overflowY: 'auto', padding: '16px 0',
      }}>
        <div style={{ padding: '0 16px 12px', fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Konzept &amp; Planung
        </div>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '8px 16px', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: activeSection === s.id ? 600 : 400,
              color: activeSection === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: activeSection === s.id ? 'var(--bg-subtle)' : 'transparent',
              borderLeft: activeSection === s.id ? `3px solid ${C.blue}` : '3px solid transparent',
              transition: 'all 0.12s', fontFamily: 'inherit',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Inhalt */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 860 }}>
        {activeSection === 'uebersicht'    && <UebersichtTab />}
        {activeSection === 'import'        && <ImportTab />}
        {activeSection === 'datenstruktur' && <DatenstrukturTab />}
      </div>

    </div>
  )
}
