// ── Chips-Referenz (Admin) ───────────────────────────────────────────────────
// Vollständige Übersicht aller Chip-Typen, ihrer Editoren und Datenquellen.

import { PLACEHOLDER_DEFS } from '../../sw-ui/editor/extensions/PlaceholderChipExtension'
import { C, Section, Badge, InfoBox } from './_shared'

// ── Kleine Chip-Vorschau ────────────────────────────────────────────────────
function ChipPreview({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: color + '1A', color,
      border: `1px solid ${color}55`,
      borderRadius: 4, fontSize: 11, fontWeight: 600,
      padding: '2px 8px', whiteSpace: 'nowrap',
      fontFamily: 'inherit',
    }}>
      {label}
    </span>
  )
}

// ── Gruppen-Header ──────────────────────────────────────────────────────────
function GroupHeader({ color, icon, title, subtitle }: { color: string; icon: string; title: string; subtitle: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: color + '10', border: `1px solid ${color}33`,
      borderRadius: 8, padding: '10px 14px', marginBottom: 12,
    }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color }}>{title}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{subtitle}</div>
      </div>
    </div>
  )
}

// ── Placeholder-Chips-Tabelle ────────────────────────────────────────────────
function PlaceholderTable() {
  // Gruppierung nach Farbe (entspricht Datenquelle)
  const gruppen: { label: string; color: string; keys: string[] }[] = [
    {
      label: 'script_db (Episode & Werkstufe)',
      color: C.blue,
      keys: ['{{produktion}}', '{{folge}}', '{{folgentitel}}', '{{fassung}}', '{{version}}', '{{stand_datum}}', '{{werkstufe}}', '{{folge_laenge_netto}}'],
    },
    {
      label: 'produktion.app (Produktionsmeta)',
      color: C.orange,
      keys: ['{{staffel}}', '{{block}}', '{{sender}}', '{{buero_adresse}}', '{{tel_produktion}}', '{{sendedatum}}', '{{produktionszeitraum}}'],
    },
    {
      label: 'auth.app (Firma & Nutzer)',
      color: '#5856D6',
      keys: ['{{autor}}', '{{firmenname}}', '{{firmen_adresse}}', '{{rechtsform}}', '{{handelsregister}}', '{{ust_id}}', '{{geschaeftsfuehrung}}', '{{firmen_email}}', '{{firmen_telefon}}', '{{regie}}'],
    },
    {
      label: 'Berechnet beim Export',
      color: C.green,
      keys: ['{{aktuelles_datum}}', '{{aktuelles_uhrzeit}}', '{{aktuelles_jahr}}'],
    },
    {
      label: 'Nur Fußzeile — Berechnet beim PDF-Export',
      color: C.green,
      keys: ['{{seite}}', '{{seiten_gesamt}}'],
    },
    {
      label: 'Dokument-Vorlage (Sonderfall)',
      color: '#FF9F0A',
      keys: ['{{notiz_inhalt}}'],
    },
    {
      label: 'Export-Eingabe (beim Export befüllt — stille Chips)',
      color: '#FF3B30',
      keys: ['{{persoenlicher_ausdruck}}', '{{revision}}', '{{revisions_farbe}}'],
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {gruppen.map(gruppe => {
        const defs = gruppe.keys.map(k => PLACEHOLDER_DEFS.find(d => d.key === k)).filter(Boolean) as typeof PLACEHOLDER_DEFS
        if (defs.length === 0) return null
        return (
          <div key={gruppe.label}>
            <div style={{
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6,
              color: gruppe.color, marginBottom: 8, paddingLeft: 2,
            }}>
              {gruppe.label}
            </div>
            <div style={{
              border: `1px solid ${C.border}`, borderRadius: 8,
              overflow: 'hidden', fontSize: 12,
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '160px 120px 1fr 140px',
                background: C.surface, borderBottom: `1px solid ${C.border}`,
                padding: '5px 12px', gap: 8,
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: C.muted,
              }}>
                <span>Chip</span>
                <span>Zone</span>
                <span>Beschreibung</span>
                <span>Datenquelle</span>
              </div>
              {defs.map((def, i) => (
                <div key={def.key} style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 120px 1fr 140px',
                  gap: 8, padding: '8px 12px', alignItems: 'start',
                  borderBottom: i < defs.length - 1 ? `1px solid ${C.border}` : undefined,
                  background: i % 2 === 0 ? 'transparent' : C.surface + '80',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ChipPreview label={def.label} color={def.color} />
                  </div>
                  <div>
                    {def.zone === 'alle'
                      ? <span style={{ fontSize: 10, color: C.muted }}>alle Bereiche</span>
                      : <Badge color={C.orange}>nur Fußzeile</Badge>
                    }
                  </div>
                  <div style={{ fontSize: 11, color: C.text, lineHeight: 1.55 }}>{def.beschreibung}</div>
                  <div>
                    <code style={{ fontSize: 10, color: gruppe.color, wordBreak: 'break-all', lineHeight: 1.5 }}>{def.quelle}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Szenen-Chips-Tabelle ─────────────────────────────────────────────────────
function SzenenChipsTable() {
  const rows = [
    {
      name: 'Rollen-Chip',
      prefix: 'R·',
      farbe: C.blue,
      editoren: ['SceneEditor (Zeile R·)'],
      dbTabellen: ['characters', 'scene_characters', 'character_kategorien'],
      api: 'GET /api/scene-identities/:id/characters\nPOST /api/scene-identities/:id/characters\nDELETE /api/scene-identities/:id/characters/:charId',
      notiz: 'Nur Charaktere mit kategorie_typ = "rolle".',
    },
    {
      name: 'Komparsen-Chip',
      prefix: 'K·',
      farbe: '#757575',
      editoren: ['SceneEditor (Zeile K·)'],
      dbTabellen: ['characters', 'scene_characters', 'character_kategorien'],
      api: 'GET /api/scene-identities/:id/characters\nPOST /api/scene-identities/:id/characters\nDELETE /api/scene-identities/:id/characters/:charId',
      notiz: 'Gleiche Endpunkte wie Rollen-Chip — Unterscheidung via kategorie_typ = "komparse".',
    },
    {
      name: 'Story-Strang-Chip',
      prefix: 'S·',
      farbe: '#888',
      editoren: ['SceneEditor (Zeile S·)', 'StrangVerwaltungModal'],
      dbTabellen: ['straenge', 'dokument_szenen_straenge'],
      api: 'GET /api/straenge?produktion_id=X\nPOST /api/straenge/:strangId/szenen\nDELETE /api/straenge/:strangId/szenen/:szeneId',
      notiz: 'Chip-Farbe wird pro Strang konfiguriert (straenge.farbe). Nur Stränge mit status = "aktiv" erscheinen im Picker.',
    },
    {
      name: 'Wechselschnitt-Partner-Chip',
      prefix: '⇄ Sz.X',
      farbe: C.blue,
      editoren: ['SceneEditor (Sondertyp: Wechselschnitt)'],
      dbTabellen: ['wechselschnitt_partner'],
      api: 'GET /api/dokument-szenen/:id/wechselschnitt-partner\nPUT /api/dokument-szenen/:id/wechselschnitt-partner',
      notiz: 'PUT ersetzt alle Partner der Szene atomisch inkl. reziproker Verknüpfung. Quelle für den Picker: alle scene_identities der aktuellen Werkstufe.',
    },
    {
      name: 'Flashback-Referenz-Chip',
      prefix: 'F·Sz.X',
      farbe: '#AF52DE',
      editoren: ['SceneEditor (Sondertyp: Flashback)'],
      dbTabellen: ['dokument_szenen', 'scene_identities'],
      api: 'PUT /api/dokument-szenen/:id\n(Felder: flashback_referenz_id,\nflashback_referenz_werkstufe_id,\nflashback_referenz_freitext)',
      notiz: 'Zwei Modi: verknüpfte Szene (flashback_referenz_id = scene_identity UUID) oder Freitext (flashback_referenz_freitext). Kein eigener Endpunkt — wird über PUT dokument-szenen gespeichert.',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.map(row => (
        <div key={row.name} style={{
          border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', fontSize: 12,
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: C.surface, borderBottom: `1px solid ${C.border}`,
            padding: '8px 14px',
          }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center',
              background: row.farbe + '1A', color: row.farbe,
              border: `1px solid ${row.farbe}55`,
              borderRadius: 4, fontSize: 11, fontWeight: 700,
              padding: '2px 8px', whiteSpace: 'nowrap',
            }}>
              {row.prefix}
            </span>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{row.name}</span>
          </div>
          {/* Body */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
            <div style={{ padding: '10px 14px', borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.muted, marginBottom: 6, letterSpacing: 0.4 }}>Editoren</div>
              {row.editoren.map(e => (
                <div key={e} style={{ color: C.text, lineHeight: 1.6 }}>{e}</div>
              ))}
            </div>
            <div style={{ padding: '10px 14px', borderRight: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.muted, marginBottom: 6, letterSpacing: 0.4 }}>DB-Tabellen</div>
              {row.dbTabellen.map(t => (
                <div key={t}><code style={{ fontSize: 11, color: C.blue }}>{t}</code></div>
              ))}
              <div style={{ marginTop: 8, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.muted, marginBottom: 4, letterSpacing: 0.4 }}>API-Endpunkte</div>
              <pre style={{ margin: 0, fontSize: 10, color: C.text, fontFamily: 'monospace', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{row.api}</pre>
            </div>
            <div style={{ padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: C.muted, marginBottom: 6, letterSpacing: 0.4 }}>Hinweise</div>
              <div style={{ color: C.muted, lineHeight: 1.6 }}>{row.notiz}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Zonen-Erklärung ──────────────────────────────────────────────────────────
function ZonenErklarung() {
  const zonen = [
    { zone: 'body', label: 'Body', color: C.blue, chips: 'Alle Chips außer {{seite}} und {{seiten_gesamt}}', notiz: 'Haupttextbereich der Vorlage. Enthält auch {{notiz_inhalt}} als Inhalts-Slot.' },
    { zone: 'kopfzeile', label: 'Kopfzeile', color: C.orange, chips: 'Alle Chips außer {{seite}} und {{seiten_gesamt}}', notiz: 'Drei Spalten: links, mitte, rechts. Seitenzahlen sind hier technisch nicht sinnvoll.' },
    { zone: 'fusszeile', label: 'Fußzeile', color: C.green, chips: 'Alle Chips inkl. {{seite}} und {{seiten_gesamt}}', notiz: 'Drei Spalten: links, mitte, rechts. Einzige Zone, in der Seitenzahlen verfügbar sind.' },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {zonen.map(z => (
        <div key={z.zone} style={{
          border: `1px solid ${z.color}44`, borderRadius: 8, padding: '12px 14px',
          background: z.color + '08',
        }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: z.color, marginBottom: 6 }}>{z.label}</div>
          <div style={{ fontSize: 11, color: C.text, marginBottom: 6, lineHeight: 1.55 }}>{z.chips}</div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>{z.notiz}</div>
        </div>
      ))}
    </div>
  )
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────
export default function ChipsReferenzTab() {
  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px 0' }}>Chips-Referenz</h1>
      <p style={{ color: C.muted, fontSize: 13, margin: '0 0 32px 0', lineHeight: 1.6 }}>
        Vollständige Übersicht aller Chip-Typen — welche Editoren sie nutzen, woher die Daten kommen
        und welche API-Endpunkte dahinterstecken.
      </p>

      {/* ── Abschnitt 1: Placeholder-Chips ─────────────────────────────────── */}
      <Section title="1. Placeholder-Chips (Dokument-Vorlagen)">
        <GroupHeader
          color={C.blue}
          icon="📝"
          title="Tiptap-Node: placeholder_chip"
          subtitle="Werden in Dokument-Vorlagen platziert und beim Export durch echte Werte ersetzt. Kein interaktiver Nutzer-Input."
        />

        <InfoBox title="Zonen — wo welche Chips erlaubt sind" color={C.orange}>
          Jeder Placeholder-Chip hat eine Zone: <strong>alle</strong> (Body + Kopf + Fußzeile) oder <strong>fusszeile</strong> (nur Fußzeile).
          Die Zone bestimmt, wo die Palette den Chip anzeigt. <code style={{ fontFamily: 'monospace' }}>{'{{seite}}'}</code> und <code style={{ fontFamily: 'monospace' }}>{'{{seiten_gesamt}}'}</code> sind die einzigen Fußzeilen-exklusiven Chips —
          wer sie im Body platziert, sieht dort keinen Wert.
        </InfoBox>

        <ZonenErklarung />

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: C.muted, marginBottom: 10 }}>
            Eingebunden in
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {[
              'DokumentVorlagenEditor (sw-ui) — Body',
              'DokumentVorlagenEditor (sw-ui) — Kopfzeile (3 Spalten)',
              'DokumentVorlagenEditor (sw-ui) — Fußzeile (3 Spalten)',
              'KopfZeilenEditor (sw-ui) — Standalone Kopf-/Fußzeile',
            ].map(e => (
              <span key={e} style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '4px 10px', fontSize: 11, color: C.text,
              }}>{e}</span>
            ))}
          </div>
        </div>

        <PlaceholderTable />

        <div style={{ marginTop: 16, padding: '10px 14px', background: C.surface, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
          <strong style={{ color: C.text }}>Definitions-Datei:</strong>{' '}
          <code style={{ fontFamily: 'monospace', color: C.blue }}>frontend/src/sw-ui/editor/extensions/PlaceholderChipExtension.ts</code>
          {' — '}PLACEHOLDER_DEFS-Array. Neue Chips dort eintragen + im Export-Handler in{' '}
          <code style={{ fontFamily: 'monospace', color: C.blue }}>backend/src/routes/export.ts</code> den Wert befüllen.
        </div>
      </Section>

      {/* ── Abschnitt 2: Szenen-Chips ───────────────────────────────────────── */}
      <Section title="2. Szenen-Chips (SceneEditor)">
        <GroupHeader
          color={C.orange}
          icon="🎬"
          title="Interaktive Szenen-Metadaten-Chips"
          subtitle="Werden vom Nutzer gesetzt und direkt in der Datenbank gespeichert. CSS-Klasse: sf-char-chip (außer WS/FB-Chips, die inline gerendert werden)."
        />
        <SzenenChipsTable />
      </Section>

      {/* ── Abschnitt 3: Neue Chips hinzufügen ─────────────────────────────── */}
      <Section title="3. Neuen Chip-Typ hinzufügen">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ border: `1px solid ${C.blue}33`, borderRadius: 8, padding: '14px 16px', background: C.blue + '06' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.blue, marginBottom: 8 }}>Neuer Placeholder-Chip</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.text, lineHeight: 2 }}>
              <li>Eintrag in <code style={{ fontFamily: 'monospace', fontSize: 11 }}>PLACEHOLDER_DEFS</code> in<br /><code style={{ fontFamily: 'monospace', fontSize: 10, color: C.blue }}>sw-ui/editor/extensions/PlaceholderChipExtension.ts</code></li>
              <li>Wert im Backend-Export-Handler befüllen<br /><code style={{ fontFamily: 'monospace', fontSize: 10, color: C.blue }}>backend/src/routes/export.ts</code></li>
              <li>sw-ui-Dateien in alle betroffenen Apps kopieren</li>
            </ol>
          </div>
          <div style={{ border: `1px solid ${C.orange}33`, borderRadius: 8, padding: '14px 16px', background: C.orange + '06' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.orange, marginBottom: 8 }}>Neuer Szenen-Chip</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.text, lineHeight: 2 }}>
              <li>Migration: neue Spalte oder Tabelle anlegen (nächste verfügbare: v81)</li>
              <li>Backend-Endpunkt in passendem Router ergänzen</li>
              <li>SceneEditor: Zeile + Dropdown + State hinzufügen</li>
              <li>CSS-Klasse <code style={{ fontFamily: 'monospace', fontSize: 11 }}>sf-char-chip</code> wiederverwenden oder inline stylen</li>
            </ol>
          </div>
        </div>
      </Section>
    </div>
  )
}
