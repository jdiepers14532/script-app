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

function HilfePage() {
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
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 6px 0' }}>Datenmodell — Script-App</h1>
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
    </AppShell>
  )
}

export default HilfePage
