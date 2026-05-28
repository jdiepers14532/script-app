import { C } from './_shared'

interface Props {
  isAdmin?: boolean
}

export default function SeitenzahlenTab({ isAdmin }: Props) {
  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 24 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 0 }
  const h3: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: C.muted, marginBottom: 12 }

  return (
    <div style={{ maxWidth: 760 }}>

      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.blue}18 0%, ${C.orange}12 100%)`,
        border: `1px solid ${C.blue}33`,
        borderRadius: 12, padding: '20px 24px', marginBottom: 32,
        display: 'flex', gap: 16, alignItems: 'flex-start',
      }}>
        <div style={{ fontSize: 32, lineHeight: 1, flexShrink: 0 }}>📄</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Seitenzahlen in der Szenenübersicht</div>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>
            Jede Szene zeigt ihre Seitenzahl direkt in der Szenenübersicht an — z.B. <strong>S.12</strong> oder <strong>S.12–14</strong>.
            Diese Zahl entspricht genau dem, was im PDF-Export auf der Seite steht.
          </div>
        </div>
      </div>

      {/* ── Wie funktionieren Seitenzahlen? ── */}
      <div style={card}>
        <h2 style={h2}>Wie funktionieren Seitenzahlen?</h2>
        <p style={p}>
          Die Seitenzahlen werden automatisch berechnet und aktualisiert — du musst nichts manuell auslösen.
          Jede Szene beginnt auf einer neuen Seite. Die Seitenzahl gibt an, auf welcher Seite des fertigen Drehbuchs
          die Szene beginnt (und endet, wenn sie mehr als eine Seite umfasst).
        </p>

        <h3 style={h3}>Was beeinflusst die Seitenzahlen?</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { icon: '✍️', label: 'Content-Länge', desc: 'Mehr Text = mehr Seiten', color: C.blue },
            { icon: '📐', label: 'Seitenformat', desc: 'A4 oder Letter (59 vs. 56 Zeilen/Seite)', color: C.orange },
            { icon: '🔤', label: 'Szenenkopf', desc: 'Schrift, Zeilenabstand, Kopfzeilen-Höhe', color: C.purple },
          ].map(f => (
            <div key={f.label} style={{ border: `1px solid ${f.color}33`, borderRadius: 8, padding: '10px 14px', background: f.color + '08' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{f.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 12, color: f.color }}>{f.label}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Wann werden Seitenzahlen neu berechnet?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Szenen-Content wird gespeichert', 'sofort, im Hintergrund'],
            ['Szene hinzugefügt oder gelöscht', 'sofort, im Hintergrund'],
            ['Reihenfolge der Szenen geändert', 'sofort, im Hintergrund'],
            ['Absatzformat oder Szenenkopf-Vorlage geändert', 'automatisch nach Änderung'],
            ['Manueller „Neu berechnen"-Button (Admin)', 'auf Anfrage'],
          ].map(([event, timing]) => (
            <div key={event} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: C.green, flexShrink: 0 }}>↻</span>
              <span style={{ flex: 1 }}>{event}</span>
              <span style={{ color: C.muted, fontSize: 11, flexShrink: 0 }}>{timing}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Seitenzahlen sperren ── */}
      <div style={card}>
        <h2 style={h2}>Seitenzahlen sperren</h2>
        <p style={p}>
          Wenn ein Script offiziell ausgegeben wird (Produktionsfassung geloggt), werden die Seitenzahlen
          automatisch <strong>eingefroren</strong>. Das stellt sicher, dass alle Beteiligten
          mit denselben Seitenzahlen arbeiten — auch wenn du danach noch Korrekturen machst.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {[
            {
              label: 'Entsperrt (normal)',
              desc: 'Seitenzahlen werden bei jeder Änderung neu berechnet.',
              icon: '🔓',
              color: C.green,
            },
            {
              label: 'Gesperrt',
              desc: 'Seitenzahlen sind eingefroren. Content-Änderungen und neue Szenen sind weiterhin möglich.',
              icon: '🔒',
              color: C.orange,
            },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', gap: 12, padding: '12px 16px', background: s.color + '10', border: `1px solid ${s.color}33`, borderRadius: 8 }}>
              <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12, color: s.color, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Wann wird automatisch gesperrt?</h3>
        <p style={p}>
          Wenn du einer Werkstufe ein <strong>Produktionsfassung-Label</strong> zuweist (z.B. „Drehfassung", „Abgabefassung"),
          werden die Seitenzahlen automatisch eingefroren. Beim Sperren läuft zunächst ein finaler
          Recalc, um exakte Startwerte einzufrieren.
        </p>
        <p style={p}>
          Das Seitenzahlen-Lock-Badge erscheint dann im Werkstufen-Header neben der Versionsnummer (orangefarbenes „S. gesperrt").
          Ein Tooltip zeigt Datum und Person der Sperrung.
        </p>

        <h3 style={h3}>Gesperrt — was ändert sich?</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { action: 'Content bearbeiten', allowed: true, note: 'Erlaubt — Seitenzahlen bleiben aber eingefroren' },
            { action: 'Neue Szene einfügen', allowed: true, note: 'Erlaubt — Seitenzahlen bleiben aber eingefroren' },
            { action: 'Szene löschen / umsortieren', allowed: true, note: 'Erlaubt — Seitenzahlen bleiben aber eingefroren' },
            { action: 'Seitenformat ändern', allowed: false, note: 'Kein Effekt — recalcPageNumbers überspringt gesperrte Werkstufen' },
            { action: 'Szenenkopf-Vorlage ändern', allowed: false, note: 'Kein Effekt auf gesperrte Seitenzahlen' },
          ].map(r => (
            <div key={r.action} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 8, fontSize: 12 }}>
              <span style={{ color: r.allowed ? C.green : C.muted, flexShrink: 0, marginTop: 1 }}>{r.allowed ? '✓' : '–'}</span>
              <span style={{ flex: 1, fontWeight: r.allowed ? 400 : 400 }}>{r.action}</span>
              <span style={{ color: C.muted, fontSize: 11 }}>{r.note}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Entsperren ── */}
      <div style={card}>
        <h2 style={h2}>Entsperren</h2>
        <p style={p}>
          Entsperren ist nur mit <strong>Superadmin-Berechtigung</strong> möglich und sollte nur in Ausnahmefällen
          erfolgen. Nach dem Entsperren werden beim nächsten Speichern alle Seitenzahlen neu berechnet —
          sie können sich dann verschieben, falls Content nach dem ursprünglichen Lock geändert wurde.
        </p>
        <div style={{ padding: '12px 16px', background: C.orange + '12', border: `1px solid ${C.orange}33`, borderRadius: 8, fontSize: 12, color: C.muted }}>
          <strong style={{ color: C.orange }}>Hinweis:</strong> Superadmin kann das „S. gesperrt"-Badge im Werkstufen-Header
          anklicken, um einen Entsperren-Dialog zu öffnen.
          Das Label der Werkstufe bleibt dabei unverändert.
        </div>
      </div>

      {/* ── Admin-Bereich ── */}
      {isAdmin && (
        <>
          <div style={{ height: 1, background: C.border, margin: '8px 0 24px' }} />
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: C.muted, marginBottom: 16 }}>
            Admin
          </div>

          {/* Technische Details */}
          <div style={card}>
            <h2 style={h2}>Technische Details — Seitenzahlen-Engine</h2>
            <p style={p}>
              Seitenzahlen werden als Float-Bruchteile berechnet (0-indiziert: 0.0 = Anfang Seite 1, 1.0 = Anfang Seite 2).
              Jede Szene beginnt auf einer neuen Seite (page-break-before: always).
            </p>

            <div style={{ background: '#000', borderRadius: 10, padding: '16px 20px', color: '#fff', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8, marginBottom: 16 }}>
              <div style={{ color: '#888', marginBottom: 8 }}>// Algorithmus (vereinfacht)</div>
              <div><span style={{ color: C.orange }}>currentFraction</span> = 0.0</div>
              <div style={{ color: '#888' }}>für jede Szene:</div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.blue }}>currentFraction</span> = Math.ceil(<span style={{ color: C.blue }}>currentFraction</span>) <span style={{ color: '#888' }}>// neue Seite</span></div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.green }}>pageLenFraction</span> = (H_lines + contentLines) / LINES_PER_PAGE</div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.orange }}>seite_von</span> = currentFraction</div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.orange }}>seite_bis</span> = currentFraction + pageLenFraction</div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.orange }}>seite_von_str</span> = floor(seite_von) + 1</div>
              <div style={{ paddingLeft: 16 }}><span style={{ color: C.orange }}>seite_bis_str</span> = floor(seite_bis - 0.0001) + 1</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'A4', value: '59 Nutzzeilen/Seite', detail: 'Courier 12pt, 25mm oben + 20mm unten' },
                { label: 'Letter', value: '56 Nutzzeilen/Seite', detail: 'Courier 12pt, 1in oben + 0.5in unten' },
                { label: 'H_lines', value: 'Dynamisch aus Template', detail: 'margin-top + Kopfzeilen-Höhe + margin-bottom' },
                { label: 'Content-Lines', value: 'Float (kein Ceiling)', detail: 'Exakte Zeilenanzahl, kein Runden-Fehler' },
              ].map(f => (
                <div key={f.label} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>{f.label}</div>
                  <div style={{ fontSize: 12, color: C.blue }}>{f.value}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Lock-Management */}
          <div style={card}>
            <h2 style={h2}>Seitenzahlen-Lock — Admin-Verwaltung</h2>

            <h3 style={h3}>Automatischer Lock via Produktionsfassung-Label</h3>
            <p style={p}>
              Wenn einer Werkstufe ein Label mit <code>is_produktionsfassung = true</code> zugewiesen wird
              (konfigurierbar in den DK-Einstellungen → Fassungs-Labels), läuft automatisch:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {[
                '1. Finaler recalcPageNumbers-Lauf (alle Szenen frisch berechnet)',
                '2. seitenzahlen_gesperrt = TRUE',
                '3. gesperrt_am = NOW()',
                '4. gesperrt_von = Name des ausführenden Users',
              ].map(s => (
                <div key={s} style={{ padding: '6px 12px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }}>{s}</div>
              ))}
            </div>

            <h3 style={h3}>Manueller Lock (herstellungsleitung / superadmin)</h3>
            <p style={p}>
              Über den API-Endpunkt <code>POST /api/werkstufen/:id/seitenzahlen-lock</code> kann ein
              manueller Lock ausgelöst werden — ohne Produktionsfassung-Label.
              Gleicher Ablauf: finaler Recalc → Lock setzen.
            </p>

            <h3 style={h3}>Entsperren (nur superadmin)</h3>
            <p style={p}>
              <code>DELETE /api/werkstufen/:id/seitenzahlen-lock</code> — oder Klick auf das
              „S. gesperrt"-Badge im Werkstufen-Header (mit Bestätigungs-Dialog).
              Beim Entsperren wird beim nächsten Content-Save ein voller Recalc ausgelöst.
            </p>
            <div style={{ padding: '12px 16px', background: C.orange + '12', border: `1px solid ${C.orange}33`, borderRadius: 8, fontSize: 12, color: C.muted }}>
              <strong style={{ color: C.orange }}>Warnung:</strong> Nach dem Entsperren können sich alle Seitenzahlen verschieben,
              wenn Content zwischen originalem Lock und jetzt geändert wurde.
            </div>

            <h3 style={h3}>Manueller Recalc</h3>
            <p style={p}>
              Admin-Bereich → <code>POST /api/admin/recalc-seitenzahlen</code> — mit optionalem
              Body <code>{`{ "werkstufe_id": "..." }`}</code> für eine einzelne Werkstufe.
              Ohne Body: alle nicht-gesperrten Werkstufen.
            </p>
            <p style={p}>
              Nützlich nach Bulk-Importen oder wenn Seitenzahlen verdächtig erscheinen.
            </p>
          </div>

          {/* Datenbankschema */}
          <div style={card}>
            <h2 style={h2}>Datenbankschema</h2>
            <div style={{ background: '#000', borderRadius: 10, padding: '16px 20px', color: '#fff', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.8 }}>
              <div style={{ color: '#888', marginBottom: 8 }}>-- dokument_szenen</div>
              <div><span style={{ color: C.blue }}>seite_von</span>       NUMERIC   <span style={{ color: '#888' }}>-- 0-indexed Float (0.0 = Anfang S.1)</span></div>
              <div><span style={{ color: C.blue }}>seite_bis</span>       NUMERIC   <span style={{ color: '#888' }}>-- wo Inhalt endet</span></div>
              <div><span style={{ color: C.green }}>seite_von_str</span>  VARCHAR   <span style={{ color: '#888' }}>-- "12" oder "12A"</span></div>
              <div><span style={{ color: C.green }}>seite_bis_str</span>  VARCHAR   <span style={{ color: '#888' }}>-- "14" oder "12B"</span></div>
              <div style={{ marginTop: 12, color: '#888' }}>-- werkstufen</div>
              <div><span style={{ color: C.orange }}>seitenzahlen_gesperrt</span>  BOOLEAN   <span style={{ color: '#888' }}>-- DEFAULT FALSE</span></div>
              <div><span style={{ color: C.orange }}>gesperrt_am</span>           TIMESTAMPTZ</div>
              <div><span style={{ color: C.orange }}>gesperrt_von</span>          TEXT      <span style={{ color: '#888' }}>-- Name des Users</span></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
