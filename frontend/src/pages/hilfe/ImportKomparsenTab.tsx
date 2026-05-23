import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

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
    { num: 8, title: 'Glossar-Filter (Transitions & Abkürzungen)', text: 'Bevor Rollen und Komparsen angelegt werden, prüft der Import jeden Namen gegen das Glossar der Produktion (Drehbuchkoordination → Glossar). Kürzel und Bezeichnungen aus dem Glossar werden als Übergangsanweisungen erkannt (z.B. „PEN" für Penerationswechsel) und übersprungen — sie landen nicht als Character in der Datenbank.' },
  ]

  const examples = [
    { pdf: '4x PatientInnen o.T.',     name: 'PatientInnen',     anzahl: 4,  spiel: 'o.t.',  header: true,  repliken: 0 },
    { pdf: '2x Krankenpflegerin o.T.', name: 'Krankenpflegerin', anzahl: 2,  spiel: 'o.t.',  header: true,  repliken: 0 },
    { pdf: 'Tresenkraft',             name: 'Tresenkraft',      anzahl: 1,  spiel: 'spiel', header: false, repliken: 0 },
    { pdf: 'Gast o.T.',               name: 'Gast',             anzahl: 1,  spiel: 'o.t.',  header: true,  repliken: 0 },
  ]

  const tarifTabelle = [
    { typ: 'o.t.',  tarif: 'Komparsenvertrag',        gage: '~100-150 EUR/Tag',  hinweis: 'Austauschbar, kein Continuity-Tracking nötig' },
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
        <InfoBox title="Glossar-Filter: Transitions werden nicht als Rollen importiert" color={C.green}>
          Bevor Rollen und Komparsen als Characters angelegt werden, prüft der Import jeden Namen
          gegen das <strong>Glossar</strong> der Produktion (Drehbuchkoordination → Glossar-Tab).
          Kürzel und Bezeichnungen die dort eingetragen sind — z.B. <code style={{ fontSize: 11 }}>PEN</code> für Peneration,{' '}
          <code style={{ fontSize: 11 }}>SFX</code> für Sound-Effekte — werden als Übergangsanweisungen erkannt
          und beim Import <strong>übersprungen</strong>. Dadurch landen keine Transitions oder Produktionsbegriffe
          als Character in der Datenbank. Das Glossar kann unter Drehbuchkoordination gepflegt werden.
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


export default ImportKomparsenTab
