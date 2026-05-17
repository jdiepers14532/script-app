import { useState, useEffect } from 'react'
import { C, Badge, Tag, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox, Connector, FieldBox } from './_shared'

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

// ── Such-Ergebnisse ───────────────────────────────────────────────────────────

export default StoryStaengeTab
