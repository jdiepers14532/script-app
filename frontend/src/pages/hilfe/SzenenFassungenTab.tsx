import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Szenen &amp; Fassungen — wie es zusammenspielt</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
          Eine Episode kann mehrere <strong>Fassungen</strong> haben — zum Beispiel eine Storyline, ein erstes Drehbuch
          und eine Produktionsfassung. Jede Fassung hat ihre eigene Szenenreihenfolge, kann aber dieselben
          Szenen enthalten. Szenen haben eine <strong>stabile Identität</strong>: Auch wenn sich Nummer, Motiv
          oder Position ändern, bleibt die Szene eindeutig zugeordnet — so ist ein Vergleich zwischen
          Fassungen jederzeit möglich.
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Fassung', desc: 'Storyline, Drehbuch, Produktion…', color: C.orange },
            { label: 'Szenen-Identität', desc: 'Bleibt über alle Fassungen stabil', color: C.blue },
            { label: 'Szenen-Inhalt', desc: 'Text + Kopfzeilen pro Fassung', color: C.green },
            { label: 'Soft-Delete', desc: 'Gelöschte Szenen bleiben für Vergleiche', color: C.purple },
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
      <Section title="1. Aufbau — Produktion, Episode, Fassung und Szene">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>
          Die Hierarchie: <strong>Produktion → Episode → Fassung → Szene</strong>.
          Eine Szene kann in mehreren Fassungen erscheinen, hat aber immer dieselbe stabile Identität.
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
                { name: 'geloescht', type: 'BOOL', desc: 'Soft-Delete (bleibt für Diff)' },
                { name: 'is_wechselschnitt', type: 'BOOL', desc: 'Wechselschnitt-Szene (Legacy)' },
                { name: 'sondertyp', type: 'TEXT', desc: "NULL|'wechselschnitt'|'stockshot'|'flashback'" },
                { name: 'stockshot_kategorie', type: 'TEXT', desc: "'ortswechsel'|'zeit_vergeht'|'stimmungswechsel'" },
                { name: 'stockshot_stimmung', type: 'TEXT', desc: 'Stimmung bei Stimmungswechsel' },
                { name: 'stockshot_neu_drehen', type: 'BOOL', desc: 'Muss neu gefilmt werden' },
                { name: 'flashback_referenz_id', type: 'UUID', desc: 'FK → scene_identities (Ursprungsszene)' },
                { name: 'bearbeitet_von', type: 'TEXT', desc: 'Wer hat zuletzt geändert' },
                { name: 'bearbeitet_am', type: 'TSTZ', desc: 'Letzte Änderung' },
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
      {/* 2. Werkstufe vs. Fassung — was hat sich geändert */}
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
                'Alle dokument_szenen kopieren (gelöscht=false)',
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
                AND gelöscht=false
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
              <code>geloescht BOOLEAN</code> — kein echtes Löschen.
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
      {/* 4. Verknüpfte Tabellen */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="4. Verknüpfte Tabellen (Characters, Vorstopp, Revision)">
        <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>
          Characters und Vorstopp hängen an <code>scene_identity_id</code> (werkstufenübergreifend stabil).
          Revisionen hängen an <code>dokument_szene_id</code> (pro Werkstufe-Ausprägung).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <TableCard title="scene_characters" color={C.orange}
            note="Welche Charaktere spielen in dieser Szene? (v46: werkstufe_id hinzugefügt)"
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
          note="Delta-Tracking: Was hat sich geändert?"
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
          Charaktere sind globale Entitäten (produktionsübergreifend). Pro Staffel gibt es
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
            { left: '1. INT. Küche - TAG', right: '1. INT. Küche - TAG', status: 'gleich', bg: 'transparent' },
            { left: '2. EXT. Garten - TAG', right: '2. EXT. Garten - ABEND', status: 'geändert', bg: '#fef3c7' },
            { left: '3. INT. Büro - TAG', right: null, status: 'gestrichen', bg: '#fee2e2' },
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
                {row.status === 'geändert' && <span style={{ color: C.orange }}>=/=</span>}
                {row.status === 'gestrichen' && <span style={{ color: C.red }}>DEL</span>}
                {row.status === 'neu' && <span style={{ color: C.green }}>NEW</span>}
              </div>
              <div style={{ background: row.right ? (row.status === 'neu' ? '#d1fae5' : row.bg) : '#fee2e2', padding: '4px 8px', borderRadius: 4, opacity: row.right ? 1 : 0.4 }}>
                {row.right || <span style={{ fontStyle: 'italic', color: C.muted }}>— gestrichen —</span>}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 16, fontSize: 11, flexWrap: 'wrap', marginBottom: 20 }}>
          {[
            { color: '#fef3c7', border: '#f59e0b', label: 'Geändert', desc: 'Felder unterscheiden sich' },
            { color: '#d1fae5', border: '#10b981', label: 'Neu', desc: 'Nur in rechter Werkstufe' },
            { color: '#fee2e2', border: '#ef4444', label: 'Gestrichen', desc: 'gelöscht=true oder nicht kopiert' },
          ].map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 14, height: 14, borderRadius: 3, background: l.color, border: `1px solid ${l.border}`, display: 'inline-block' }} />
              <strong>{l.label}</strong>
              <span style={{ color: C.muted }}>{l.desc}</span>
            </div>
          ))}
        </div>

        {/* ── 6a. Aufruf im Editor ── */}
        <InfoBox title="So rufst du den Vergleich im Editor auf" color={C.blue}>
          In der Editor-Kopfzeile (rechts) öffnet der Button <strong>„Vergleichen"</strong> das Menü
          „Vergleichen mit …" — zur Auswahl stehen <strong>alle anderen Fassungen</strong> der Folge.
          Eingefrorene Fassungen und Revisionsstufen sind mit einer Schneeflocke markiert und stehen
          oben (stabile Referenzpunkte); auch der Vergleich mit live editierbaren Fassungen ist möglich
          (Momentaufnahme). „Vergleich beenden" schaltet zurück in den Editor.
          <div style={{ marginTop: 8 }}>
            <strong>Richtung (Word-Semantik):</strong> Die ausgewählte Vergleichsfassung ist das{' '}
            <em>Original</em>, die aktuell geöffnete Fassung die <em>überarbeitete Version</em>.
            Grün = in der aktuellen Fassung eingefügt, rot durchgestrichen = gegenüber dem Original
            entfernt. Zwei Darstellungen: <strong>Redline</strong> (Änderungen im Lesefluss) und{' '}
            <strong>Parallel</strong> (Original links, aktuelle Fassung rechts, synchron gescrollt).
          </div>
        </InfoBox>

        {/* ── 6b. Redline in der Leseansicht ── */}
        <InfoBox title="Redline-Vergleich in der Leseansicht" color={C.green}>
          Auch die <strong>Leseansicht</strong> (Lese-Modus) kann vergleichen: Neben „Fassung lesen"
          die gewünschte Fassung unter <strong>„Vergleichen mit:"</strong> wählen — die ganze Folge wird
          dann als durchgehendes Änderungsdokument im Drucklayout gerendert. Eingefügter Text grün,
          gestrichener Text rot durchgestrichen; entfallene Szenen und Absätze erscheinen an ihrer
          alten Position. Farbige Randstreifen markieren geänderte (gelb), neue (grün), gestrichene
          (rot) und verschobene (orange) Absätze.
          <div style={{ marginTop: 8, color: C.muted }}>
            Hinweis: Im Vergleichsmodus ist der Anmerkungs-Layer deaktiviert, weil der Wort-Diff die
            Textanker der Anmerkungen verändert. „Vergleich beenden" stellt ihn wieder her.
          </div>
        </InfoBox>

        {/* ── 6c. KI-Zusammenfassung ── */}
        <InfoBox title="KI-Zusammenfassung der Änderungen" color={C.purple}>
          Im Diff-Modus des Editors fasst der Button <strong>„KI-Zusammenfassung"</strong> (im blauen
          Banner) die Änderungen auf <strong>dramaturgischer Ebene</strong> zusammen: Was hat sich
          erzählerisch geändert (Handlung, Szenenfolge, Tempo), was bedeutet das für die{' '}
          <strong>Führung der Figuren</strong> (Haltung, Motivation, Beziehungsdynamik), und welche
          Konsequenzen können sich für spätere Szenen/Folgen ergeben? Rein redaktionelle Änderungen
          werden nur kurz erwähnt.
          <div style={{ marginTop: 8, color: C.muted }}>
            Die KI erhält nur die geänderten, neuen und gestrichenen Szenen (alter + neuer Text).
            Funktion <code>diff_summary</code> in den Admin-KI-Einstellungen: Provider/Modell wählbar,
            Prompt editierbar. Bei sehr großen Änderungsmengen wird gekürzt — das Modal weist darauf hin.
          </div>
        </InfoBox>
      </Section>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* 7. Kritische Punkte */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Section title="7. Kritische Punkte & Regeln">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <WarnBox title="1. Content lebt NUR in dokument_szenen.content">
            Es gibt kein separates <code>inhalt</code>-Feld auf Werkstufe/Fassung.
            Der Editor lädt und speichert ausschließlich über <code>dokument_szenen</code>.
            Dies eliminiert die frühere Redundanz zwischen <code>fassungen.inhalt</code> und{' '}
            <code>dokument_szenen.content</code>.
          </WarnBox>

          <WarnBox title="2. Version lebt NUR in werkstufen">
            <code>dokument_szenen</code> hat keine eigene Versionsnummer.
            Die Version wird über <code>werkstufe.version_nummer</code> + <code>werkstufe.typ</code> bestimmt.
            Eine Werkstufe IST die Version.
          </WarnBox>

          <WarnBox title="3. Scene Identity darf nie gelöscht werden">
            Eine <code>scene_identity</code> ist die Klammer über alle Werkstufen.
            CASCADE DELETE würde alle <code>dokument_szenen</code>,{' '}
            <code>scene_characters</code> und <code>szenen_vorstopp</code> mitlöschen.
            Nur beim Löschen einer ganzen Folge zulässig.
          </WarnBox>

          <WarnBox title="4. Abgegeben-Flag blockiert alle Szenen">
            Wenn <code>werkstufe.abgegeben = true</code>, sind <strong>alle</strong> dokument_szenen
            dieser Werkstufe eingefroren. PUT-Requests werden mit HTTP 409 abgelehnt.
            Eine neue Werkstufe muss erstellt werden.
          </WarnBox>

          <WarnBox title="5. Kollaboration pro Werkstufe">
            Bearbeitung_status-Änderungen (z.B. auf "collab") gelten für alle dokument_szenen
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
              { m: 'DELETE', p: '/api/werkstufen/:id',                     d: 'Werkstufe löschen (CASCADE)' },
              { m: 'GET',    p: '/api/werkstufen/:werkId/szenen',          d: 'Alle Szenen einer Werkstufe' },
              { m: 'POST',   p: '/api/werkstufen/:werkId/szenen',          d: 'Neue Szene hinzufuegen' },
              { m: 'PATCH',  p: '/api/werkstufen/:werkId/szenen/reorder',  d: 'Szenen-Reihenfolge aendern' },
              { m: 'POST',   p: '/api/werkstufen/:werkId/szenen/renumber', d: 'Sequentiell umnummerieren' },
              { m: 'GET',    p: '/api/werkstufen/:a/szenen/diff/:b',       d: 'Werkstufen-Vergleich (Diff)' },
              { m: 'GET',    p: '/api/werkstufen/:a/diff-detail/:b',       d: 'Block-/Wort-Diff einer Szene (a=Original, b=überarbeitet)' },
              { m: 'GET',    p: '/api/export/preview?…&compareWerkstufId=', d: 'Redline-Leseansicht (mode=read)' },
              { m: 'POST',   p: '/api/ki/diff-summary',                    d: 'KI-Zusammenfassung der Änderungen (diff_summary)' },
              { m: 'GET',    p: '/api/dokument-szenen/:id',                d: 'Einzelne Szene laden' },
              { m: 'PUT',    p: '/api/dokument-szenen/:id',                d: 'Szenenkopf + Content aktualisieren' },
              { m: 'DELETE', p: '/api/dokument-szenen/:id',                d: 'Soft-Delete (gelöscht=true)' },
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
            { phase: '4', name: 'Frontend: Editor-Refactoring', desc: 'Deployed — ScriptPage lädt Werkstufen-Szenen, stoppzeit_sek mm:ss', risk: 'erledigt', color: C.green },
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

export default SzenenFassungenTab
