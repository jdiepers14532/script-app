import { C, Badge, TableCard, Section, FaqItem, InfoBox, WarnBox } from './_shared'

// ── Flow-Diagramm-Bausteine ────────────────────────────────────────────────────
function FlowStep({ label, sub, color = C.blue }: { label: string; sub?: string; color?: string }) {
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 8,
      border: `1.5px solid ${color}55`, background: `${color}10`,
      textAlign: 'center', minWidth: 120,
    }}>
      <div style={{ fontWeight: 600, fontSize: 12, color }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function FlowArrow() {
  return (
    <div style={{ color: C.muted, fontSize: 14, margin: '0 4px', display: 'flex', alignItems: 'center' }}>
      →
    </div>
  )
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
      background: `${color}22`, color, border: `1px solid ${color}44`,
    }}>{label}</span>
  )
}

// ── Haupt-Tab ─────────────────────────────────────────────────────────────────
export default function FreigabeWorkflowTab() {
  return (
    <div>
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}18 0%, ${C.green}10 100%)`,
        border: `1px solid ${C.blue}33`, borderRadius: 12,
        padding: '20px 24px', marginBottom: 28,
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>Figuren- &amp; Motiv-Freigabe</h2>
        <p style={{ fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.6 }}>
          Zweistufiges Genehmigungssystem für neue Rollen/Komparsen (Budget-Freigabe) und
          Szenen-Einsätze (Dispo-Freigabe). Konfigurierbar pro Produktion über die
          DK-Koordination → Freigabe-Workflow.
        </p>
      </div>

      {/* ── Überblick ── */}
      <Section title="Überblick: Zwei Freigabe-Typen">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8 }}>
          {/* Fall B */}
          <div style={{ border: `2px solid ${C.orange}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: `${C.orange}18`, padding: '12px 16px', borderBottom: `1px solid ${C.orange}33` }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.orange }}>Budget-Freigabe (Fall B)</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Neue Rolle / Komparse anlegen</div>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 12, lineHeight: 1.7 }}>
              <div>Wann: Erstmalige Vergabe einer Rolle in dieser Produktion</div>
              <div style={{ marginTop: 6 }}>Objekt: <code style={{ fontSize: 11 }}>character_productions</code></div>
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <StatusPill label="ausstehend" color={C.orange} />
                <span style={{ fontSize: 10, color: C.muted, alignSelf: 'center' }}>→</span>
                <StatusPill label="freigegeben" color={C.green} />
                <span style={{ fontSize: 10, color: C.muted, alignSelf: 'center' }}>/</span>
                <StatusPill label="abgelehnt" color={C.red} />
              </div>
            </div>
          </div>
          {/* Fall A */}
          <div style={{ border: `2px solid ${C.blue}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ background: `${C.blue}18`, padding: '12px 16px', borderBottom: `1px solid ${C.blue}33` }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.blue }}>Dispo-Freigabe (Fall A)</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Szenen-Einsatz bestätigen</div>
            </div>
            <div style={{ padding: '12px 16px', fontSize: 12, lineHeight: 1.7 }}>
              <div>Wann: Eintrag einer Figur in einer neuen Szene</div>
              <div style={{ marginTop: 6 }}>Objekt: <code style={{ fontSize: 11 }}>scene_characters</code></div>
              <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <StatusPill label="ausstehend" color={C.orange} />
                <span style={{ fontSize: 10, color: C.muted, alignSelf: 'center' }}>→</span>
                <StatusPill label="bestaetigt" color={C.green} />
                <span style={{ fontSize: 10, color: C.muted, alignSelf: 'center' }}>/</span>
                <StatusPill label="abgelehnt" color={C.red} />
              </div>
            </div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
          Beide Typen können unabhängig aktiviert werden: DK-Koordination → Freigabe-Workflow → Toggles.
        </div>
      </Section>

      {/* ── Budget-Freigabe Flow ── */}
      <Section title="Budget-Freigabe — Ablauf">
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Wird ausgelöst, wenn eine Figur erstmals in der Produktion eingesetzt wird (character_productions-Eintrag).
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
          <FlowStep label="Figur wird angelegt" sub="im Editor / Besetzung" color={C.orange} />
          <FlowArrow />
          <FlowStep label="Freigabe-Anfrage" sub="automatisch erstellt" color={C.orange} />
          <FlowArrow />
          <FlowStep label="Fan-Out an Genehmiger" sub="E-Mail + In-App" color={C.orange} />
          <FlowArrow />
          <FlowStep label="Entscheidung" sub="Freigeben / Ablehnen" color={C.orange} />
          <FlowArrow />
          <FlowStep label="Status gesetzt" sub="character_productions" color={C.green} />
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>
          <strong>Quorum-Modi:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li><strong>First-Responder</strong> (Standard): Erster obligatorischer Genehmiger entscheidet — sofort abgeschlossen</li>
            <li><strong>Alle</strong>: Alle obligatorischen Genehmiger müssen zustimmen</li>
          </ul>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <strong>Stufen:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li><strong>Obligatorisch</strong>: Muss entscheiden — zählt für Quorum</li>
            <li><strong>Review</strong>: Muss prüfen, kein Veto-Recht</li>
            <li><strong>Info</strong>: Wird benachrichtigt, entscheidet nicht</li>
          </ul>
        </div>
      </Section>

      {/* ── Dispo-Freigabe Flow ── */}
      <Section title="Dispo-Freigabe — Ablauf">
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Wird ausgelöst, wenn eine Figur einer Szene zugeordnet wird (scene_characters-Eintrag).
        </div>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
          <FlowStep label="Figur in Szene" sub="im Szenenkopf eintragen" color={C.blue} />
          <FlowArrow />
          <FlowStep label="Dispo-Anfrage" sub="wird erstellt" color={C.blue} />
          <FlowArrow />
          <FlowStep label="Genehmiger benachrichtigt" sub="E-Mail + In-App" color={C.blue} />
          <FlowArrow />
          <FlowStep label="Entscheidung" sub="Bestätigen / Ablehnen" color={C.blue} />
          <FlowArrow />
          <FlowStep label="scene_characters.status" sub="→ bestaetigt / abgelehnt" color={C.green} />
        </div>
        <InfoBox>
          <strong>DK-Override:</strong> Die DK kann über Freigaben → Batch-Entscheiden mehrere Anfragen
          gleichzeitig freigeben oder ablehnen, ohne selbst Genehmiger zu sein.
        </InfoBox>
      </Section>

      {/* ── Genehmiger konfigurieren ── */}
      <Section title="Genehmiger konfigurieren">
        <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 12 }}>
          <strong>Pfad:</strong> DK-Koordination → Freigabe-Workflow → Budget-Genehmiger / Dispo-Genehmiger
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={{ background: C.subtle, borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Typ: User</div>
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Konkrete Person aus dem Auth-System. Empfohlen für namentlich zuständige Personen (z.B. Herstellungsleitung).
            </div>
          </div>
          <div style={{ background: C.subtle, borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Typ: Rolle</div>
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Alle User mit dieser Auth-Rolle werden benachrichtigt. Flexibler bei Personalwechsel.
            </div>
          </div>
        </div>
        <WarnBox>
          <strong>Selbst-Genehmigungsschutz:</strong> Wer eine Anfrage gestellt hat, kann sie nicht
          selbst genehmigen — auch wenn er als Genehmiger konfiguriert ist.
        </WarnBox>
      </Section>

      {/* ── Lock-Gate ── */}
      <Section title="Lock-Gate">
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Verhindert das Sperren einer Folge, solange offene Budget-Freigaben existieren.
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
          <FlowStep label="Folge sperren" sub="Lock-Button" color={C.red} />
          <FlowArrow />
          <FlowStep label="Pre-Flight Check" sub="offene Freigaben?" color={C.red} />
          <FlowArrow />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <FlowStep label="Keine offen" sub="→ Lock sofort" color={C.green} />
            <FlowStep label="Offen + Override aktiv" sub="→ Begründung eingeben" color={C.orange} />
            <FlowStep label="Offen, kein Override" sub="→ Lock verweigert" color={C.red} />
          </div>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 10 }}>
          <strong>Override aktivieren:</strong> DK-Koordination → Lock-Gate → „Override erlaubt" einschalten.
          Dann erscheint beim Sperren ein Dialog mit den offenen Anfragen und einem Pflicht-Begründungsfeld.
          Jeder Override wird in <code style={{ fontSize: 11 }}>freigabe_overrides</code> protokolliert.
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.7 }}>
          <strong>Lock-Trigger:</strong> Optional ein Fassungslabel eintragen (z.B. <code style={{ fontSize: 11 }}>DB3</code>) —
          dann prüft das System automatisch beim Anlegen einer Werkstufe mit diesem Label.
        </div>
      </Section>

      {/* ── o.T.-Mengenkontrolle ── */}
      <Section title="o.T.-Mengenkontrolle">
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Überwacht die Gesamtzahl der o.T.-Komparsen-Einsätze pro Produktionsblock und
          warnt, wenn ein konfiguriertes Limit überschritten wird.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div style={{ background: C.subtle, borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Was wird gezählt?</div>
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Summe aller <code style={{ fontSize: 11 }}>scene_characters.anzahl</code>-Werte
              mit <code style={{ fontSize: 11 }}>spiel_typ = 'o.t.'</code> —
              jeweils aktuellste Drehbuch-Werkstufe pro Folge.
            </div>
          </div>
          <div style={{ background: C.subtle, borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Was ist ein Block?</div>
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Folgen-Gruppe aus der Produktionsdatenbank (<code style={{ fontSize: 11 }}>productions.bloecke</code> JSONB).
              Erfordert eine Verknüpfung der Produktion mit der Produktionsdatenbank.
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 10 }}>
          <strong>Konfiguration:</strong> DK-Koordination → o.T.-Mengenkontrolle → „Obergrenze o.T. pro Block"
          (leer lassen = unbegrenzt = Funktion aus). Nach dem Speichern wird die Tabelle sofort aktualisiert.
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatusPill label="grün — ≤ 85% ausgelastet" color={C.green} />
          <StatusPill label="orange — > 85% ausgelastet" color={C.orange} />
          <StatusPill label="rot — Limit überschritten" color={C.red} />
          <StatusPill label="grau — kein Limit konfiguriert" color={C.gray} />
        </div>
      </Section>

      {/* ── Freigaben-Übersicht ── */}
      <Section title="Freigaben-Übersicht (/freigaben)">
        <div style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 12 }}>
          Die Seite <strong>/freigaben</strong> bietet zwei Ansichten:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{ background: C.subtle, borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>„Meine Freigaben"</div>
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Alle Anfragen, bei denen der eingeloggte User als Genehmiger eingetragen und
              noch nicht entschieden hat. Direkter Aktions-Button.
            </div>
          </div>
          <div style={{ background: C.subtle, borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>DK-Matrix (DK-Zugang)</div>
            <div style={{ color: C.muted, lineHeight: 1.6 }}>
              Gesamtübersicht aller offenen Anfragen einer Produktion, gruppiert nach Folge
              und Szene. Ermöglicht Batch-Entscheidungen.
            </div>
          </div>
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section title="Häufige Fragen">
        <FaqItem q="Kann ich Freigaben einzeln oder als Batch entscheiden?" a={
          <>Beides. Jeder Genehmiger entscheidet auf /freigaben seine eigenen Anfragen einzeln.
          Die DK kann über die Matrix-Ansicht mehrere Anfragen gleichzeitig per Batch-Entscheidung freigeben oder ablehnen.</>
        } />
        <FaqItem q="Was passiert, wenn ein Genehmiger nicht reagiert?" a={
          <>Nach der konfigurierten Erinnerungszeit (Standard: 3 Tage) wird automatisch eine
          Erinnerungs-E-Mail verschickt. Die DK kann jederzeit per Override entscheiden.</>
        } />
        <FaqItem q="Kann ich den Workflow komplett deaktivieren?" a={
          <>Ja — DK-Koordination → Freigabe-Workflow → „Freigabe-Workflow aktiv" ausschalten.
          Dann werden keine Anfragen mehr erstellt.</>
        } />
        <FaqItem q="Was bedeutet der Token bei externen Genehmigern?" a={
          <>Für User ohne Script-App-Account kann ein zeitlich begrenzter Token-Link generiert werden.
          Dieser ermöglicht die Entscheidung über eine einzelne Anfrage ohne Login.
          Tokens laufen nach 7 Tagen ab.</>
        } />
        <FaqItem q="Warum sehe ich keine Block-Daten in der o.T.-Mengenkontrolle?" a={
          <>Die Block-Tabelle benötigt eine Verknüpfung mit der Produktionsdatenbank.
          Ist diese nicht vorhanden, erscheint ein Hinweis. Verknüpfung einstellen:
          Produktionsdatenbank → Produktionseinstellungen → Script-App-ID.</>
        } />
        <FaqItem q="Wird der Lock-Gate-Override protokolliert?" a={
          <>Ja — jeder Override wird mit Begründung, User-ID, Zeitstempel und
          Snapshot der übersprungenen Freigaben in{' '}
          <code style={{ fontSize: 11 }}>freigabe_overrides</code> gespeichert.</>
        } />
      </Section>

      {/* ── Admin: DB-Dokumentation ── */}
      <Section title="Datenbank-Tabellen (Admin)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TableCard title="rollen_freigabe_konfiguration" color={C.orange} note="1 Zeile pro Produktion"
            fields={[
              { name: 'production_id', type: 'TEXT PK', desc: 'Script-App Produktions-ID' },
              { name: 'freigabe_aktiv', type: 'BOOL', desc: 'Workflow global an/aus' },
              { name: 'deckt_rollen', type: 'BOOL', desc: 'Budget-Freigabe aktiv' },
              { name: 'deckt_motive', type: 'BOOL', desc: 'Dispo-Freigabe aktiv' },
              { name: 'quorum', type: 'TEXT', desc: "'first_responder' | 'alle'" },
              { name: 'erinnerung_nach_tagen', type: 'INT', desc: 'Tage bis Erinnerungs-Mail' },
              { name: 'lock_override_aktiv', type: 'BOOL', desc: 'Override beim Lock erlaubt' },
              { name: 'lock_trigger_fassungslabel', type: 'TEXT?', desc: 'Fassungslabel → automatischer Lock-Check' },
              { name: 'lock_override_rollen', type: 'JSONB', desc: 'Rollen mit Override-Berechtigung' },
              { name: 'ot_obergrenze_pro_block', type: 'INT?', desc: 'NULL = unbegrenzt' },
            ]}
          />
          <TableCard title="rollen_freigabe_genehmiger" color={C.orange}
            fields={[
              { name: 'id', type: 'INT PK', desc: '' },
              { name: 'production_id', type: 'TEXT', desc: 'Produktion' },
              { name: 'user_id', type: 'TEXT?', desc: 'Konkrete Person (exklusiv mit rolle)' },
              { name: 'rolle', type: 'TEXT?', desc: 'Auth-Rolle (exklusiv mit user_id)' },
              { name: 'freigabe_typ', type: 'TEXT', desc: "'budget' | 'dispo'" },
              { name: 'stufe', type: 'TEXT', desc: "'obligatorisch' | 'review' | 'notify'" },
              { name: 'sort_order', type: 'INT', desc: 'Anzeigereihenfolge' },
            ]}
          />
          <TableCard title="rollen_freigabe_anfragen" color={C.orange} note="Budget-Freigaben"
            fields={[
              { name: 'id', type: 'INT PK', desc: '' },
              { name: 'character_id', type: 'UUID', desc: 'Figur' },
              { name: 'production_id', type: 'TEXT', desc: 'Produktion' },
              { name: 'szene_id', type: 'UUID?', desc: 'Auslösende Szene' },
              { name: 'status', type: 'TEXT', desc: "'ausstehend' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen'" },
              { name: 'beantragt_von_user_id', type: 'TEXT', desc: 'Antragsteller' },
              { name: 'beantragt_am', type: 'TIMESTAMPTZ', desc: '' },
              { name: 'notiz', type: 'TEXT?', desc: 'Freitext für Genehmiger' },
            ]}
          />
          <TableCard title="rollen_freigabe_genehmiger_status" color={C.orange} note="Entscheidung pro Genehmiger × Anfrage"
            fields={[
              { name: 'id', type: 'INT PK', desc: '' },
              { name: 'anfrage_id', type: 'INT', desc: 'FK → rollen_freigabe_anfragen' },
              { name: 'user_id', type: 'TEXT', desc: 'Genehmiger' },
              { name: 'entschieden', type: 'TEXT?', desc: "NULL | 'freigegeben' | 'abgelehnt'" },
              { name: 'entschieden_am', type: 'TIMESTAMPTZ?', desc: '' },
              { name: 'token', type: 'TEXT?', desc: 'Externer Token-Link' },
              { name: 'token_gueltig_bis', type: 'TIMESTAMPTZ?', desc: '' },
            ]}
          />
          <TableCard title="szenen_freigabe_anfragen" color={C.blue} note="Dispo-Freigaben"
            fields={[
              { name: 'id', type: 'INT PK', desc: '' },
              { name: 'character_id', type: 'UUID', desc: 'Figur' },
              { name: 'scene_identity_id', type: 'UUID', desc: 'Szene' },
              { name: 'production_id', type: 'TEXT', desc: 'Produktion' },
              { name: 'status', type: 'TEXT', desc: "'ausstehend' | 'freigegeben' | 'abgelehnt' | 'zurueckgezogen'" },
              { name: 'beantragt_von_user_id', type: 'TEXT', desc: '' },
              { name: 'beantragt_am', type: 'TIMESTAMPTZ', desc: '' },
            ]}
          />
          <TableCard title="freigabe_overrides" color={C.red} note="Audit-Log für Lock-Gate-Overrides"
            fields={[
              { name: 'id', type: 'INT PK', desc: '' },
              { name: 'typ', type: 'TEXT', desc: "'lock' | 'rote_seiten'" },
              { name: 'bezug_id', type: 'TEXT', desc: "z.B. 'prodId/folgeNr'" },
              { name: 'user_id', type: 'TEXT', desc: 'Wer hat den Override ausgeführt' },
              { name: 'begruendung', type: 'TEXT NOT NULL', desc: 'Pflichtfeld' },
              { name: 'fehlende_freigaben', type: 'JSONB', desc: 'Snapshot der übersprungenen Anfragen' },
              { name: 'erstellt_am', type: 'TIMESTAMPTZ', desc: '' },
            ]}
          />
          <TableCard title="character_productions" color={C.orange} note="Budget-Status pro Figur × Produktion"
            fields={[
              { name: 'character_id', type: 'UUID', desc: 'FK → characters' },
              { name: 'produktion_id', type: 'TEXT', desc: 'Produktion' },
              { name: 'freigabe_status', type: 'TEXT', desc: "'ausstehend' | 'freigegeben' | 'abgelehnt' | 'nicht_angefragt'" },
              { name: 'default_anzahl', type: 'INT?', desc: 'Wiederkehrende o.T.-Anzahl' },
              { name: 'angelegt_von_user_id', type: 'TEXT?', desc: 'Audit: Wer hat die Rolle angelegt' },
              { name: 'angelegt_am', type: 'TIMESTAMPTZ?', desc: '' },
            ]}
          />
          <TableCard title="scene_characters" color={C.blue} note="Dispo-Status pro Figur × Szene"
            fields={[
              { name: 'character_id', type: 'UUID', desc: 'FK → characters' },
              { name: 'scene_identity_id', type: 'UUID', desc: 'FK → scene_identities' },
              { name: 'werkstufe_id', type: 'UUID', desc: 'FK → werkstufen' },
              { name: 'spiel_typ', type: 'TEXT', desc: "'o.t.' | 'spiel' | 'text'" },
              { name: 'anzahl', type: 'INT', desc: 'Anzahl Komparsen (bei Gruppe)' },
              { name: 'status', type: 'TEXT', desc: "'ausstehend' | 'bestaetigt' | 'abgelehnt'" },
              { name: 'spiel_typ_quelle', type: 'TEXT', desc: "'header' | 'scan' | 'manuell'" },
            ]}
          />
        </div>
      </Section>
    </div>
  )
}
