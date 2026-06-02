import { C, Badge, TableCard, Arrow, Section, FaqItem, InfoBox, WarnBox } from './_shared'

function WerkstufenLabelsTab() {
  const card: React.CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 24px', marginBottom: 24 }
  const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 8, marginTop: 0 }
  const h3: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginTop: 20, marginBottom: 8, color: C.text }
  const p: React.CSSProperties = { fontSize: 13, lineHeight: 1.7, color: C.muted, marginBottom: 12 }
  const mono: React.CSSProperties = { fontFamily: 'monospace', fontSize: 11 }
  const tree: React.CSSProperties = { background: '#111', borderRadius: 10, padding: '16px 20px', color: '#e0e0e0', fontFamily: 'monospace', fontSize: 12, lineHeight: 2 }

  return (
    <div style={{ maxWidth: 780 }}>

      {/* ── Intro ── */}
      <div style={{
        background: `linear-gradient(135deg, ${C.orange}15 0%, ${C.blue}10 100%)`,
        border: `1px solid ${C.orange}33`, borderRadius: 12, padding: '20px 24px', marginBottom: 24,
      }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Drei Konzepte — ein System</div>
        <p style={{ ...p, marginBottom: 16 }}>
          Die Script-App unterscheidet drei Konzepte, die unabhaengig voneinander sind, aber zusammenspielen.
          Viele Missverstaendnisse entstehen dadurch, dass diese drei Dinge verwechselt werden.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { num: '1', label: 'Werkstufe', sub: 'Dokument-Container', desc: 'Haelt den tatsaechlichen Szenentext einer Episode in einem bestimmten Typ (Drehbuch / Storyline / Notiz)', color: C.orange },
            { num: '2', label: 'Version', sub: 'Zaehlnummer', desc: 'Wie oft wurde ein Typ fuer diese Episode schon erstellt? V1 = erstmalig, V2 = ein zweites Mal usw.', color: C.blue },
            { num: '3', label: 'Fassungs-Label', sub: 'Arbeitsschritt-Tag', desc: 'Beschreibt den semantischen Stand im Produktions-Workflow. „Edit 1", „Drehfassung" — unabhaengig von der Versionsnummer.', color: C.purple },
          ].map(c => (
            <div key={c.num} style={{ border: `1px solid ${c.color}33`, borderRadius: 10, padding: '14px 16px', background: c.color + '08' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: c.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{c.num}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: c.color }}>{c.label}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{c.sub}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. Datenbankstruktur ── */}
      <div style={card}>
        <h2 style={h2}>1. Datenbankstruktur — Wo wird was gespeichert?</h2>
        <p style={p}>Alle drei Konzepte haben eigene Tabellen bzw. Felder. Hier ein Ueberblick:</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <TableCard
            title="werkstufen"
            color={C.orange}
            note="Ein Dokument-Container pro Episode + Typ"
            fields={[
              { name: 'id', type: 'UUID', desc: 'Primaerschluessel', ok: true },
              { name: 'folge_id', type: 'UUID', desc: 'Gehoert zu dieser Episode', ok: true },
              { name: 'typ', type: 'TEXT', desc: 'drehbuch | storyline | notiz', ok: true },
              { name: 'version_nummer', type: 'INT', desc: 'Zaehlnummer (V1, V2, V3...)', ok: true },
              { name: 'label', type: 'TEXT?', desc: 'Fassungs-Label-Name (z.B. "Edit 1")', ok: true },
              { name: 'sichtbarkeit', type: 'TEXT', desc: 'privat | team | alle | colab', ok: true },
              { name: 'bearbeitung_status', type: 'TEXT', desc: 'entwurf | gesperrt', ok: true },
            ]}
          />
          <TableCard
            title="stage_labels"
            color={C.purple}
            note="Pro Produktion konfigurierbare Arbeitsschritte"
            fields={[
              { name: 'id', type: 'UUID', desc: 'Primaerschluessel', ok: true },
              { name: 'produktion_id', type: 'UUID', desc: 'Gehoert zu dieser Produktion', ok: true },
              { name: 'name', type: 'TEXT', desc: 'Anzeigename z.B. "Edit 1"', ok: true },
              { name: 'sort_order', type: 'INT', desc: 'Reihenfolge = Hierarchie', ok: true },
              { name: 'is_produktionsfassung', type: 'BOOL', desc: 'Sperrt Werkstufe beim Zuweisen', ok: true },
            ]}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <TableCard
            title="dokument_szenen"
            color={C.blue}
            note="Szenentext — Kreuzung Szene x Werkstufe"
            fields={[
              { name: 'scene_identity_id', type: 'UUID', desc: 'Welche Szene (szenennummer)', ok: true },
              { name: 'werkstufe_id', type: 'UUID', desc: 'In welcher Werkstufe', ok: true },
              { name: 'content', type: 'JSONB', desc: 'Tiptap-Dokument (eigentlicher Text)', ok: true },
              { name: 'format', type: 'TEXT', desc: 'drehbuch | storyline | notiz', ok: true },
            ]}
          />
          <TableCard
            title="rollen_freigabe_konfiguration"
            color={C.red}
            note="Lock-Gate-Schwellenwert-Konfiguration"
            fields={[
              { name: 'freigabe_aktiv', type: 'BOOL', desc: 'Rollen-Freigabe-System ein/aus', ok: true },
              { name: 'lock_trigger_fassungslabel', type: 'TEXT?', desc: 'Ab welchem Label greift das Gate', ok: true },
              { name: 'lock_trigger_werkstufen_typ', type: 'TEXT?', desc: 'Fuer welchen Typ (drehbuch / storyline)', ok: true },
            ]}
          />
        </div>
      </div>

      {/* ── 2. Werkstufe ── */}
      <div style={card}>
        <h2 style={h2}>2. Werkstufe — der Dokument-Container</h2>
        <p style={p}>
          Eine Werkstufe ist ein <strong>konkreter Container</strong>, der den Szenentext einer Episode speichert.
          Jede Episode kann mehrere Werkstufen haben — je nach Typ und wie oft ueberarbeitet wurde.
        </p>
        <InfoBox title="Analogie: Git" color={C.blue}>
          Eine Werkstufe ist wie ein <strong>Commit</strong> — ein konkreter Snapshot des Dokuments.
          Labels sind wie <strong>Tags</strong> — sie zeigen auf einen Commit, ohne selbst Inhalt zu haben.
        </InfoBox>

        <h3 style={h3}>Typen einer Werkstufe</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            { typ: 'drehbuch', desc: 'Fertiges Drehbuch mit screenplay-Format', color: C.orange },
            { typ: 'storyline', desc: 'Prosa-Storyline, Kurzform', color: C.blue },
            { typ: 'notiz', desc: 'Freies Dokument, Notizen', color: C.gray },
          ].map(t => (
            <div key={t.typ} style={{ border: `1px solid ${t.color}44`, borderRadius: 8, padding: '8px 14px', background: t.color + '08', minWidth: 160 }}>
              <code style={{ fontSize: 12, color: t.color, fontWeight: 700, display: 'block' }}>{t.typ}</code>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{t.desc}</div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Status einer Werkstufe</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { status: 'entwurf', desc: 'Bearbeitbar, Editor aktiv', color: C.green },
            { status: 'gesperrt', desc: 'Nur-Lesen, Editor deaktiviert', color: C.red },
          ].map(s => (
            <div key={s.status} style={{ flex: 1, border: `1px solid ${s.color}44`, borderRadius: 8, padding: '10px 14px', background: s.color + '08' }}>
              <code style={{ fontSize: 12, color: s.color, fontWeight: 700 }}>{s.status}</code>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{s.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Versionen ── */}
      <div style={card}>
        <h2 style={h2}>3. Versionen — Wie oft wurde dieser Typ erstellt?</h2>
        <p style={p}>
          Die <code>version_nummer</code> ist ein einfacher <strong>Zaehler</strong> — sie zaehlt, wie oft eine Werkstufe
          dieses Typs fuer diese Episode erstellt wurde. V1 = erste Werkstufe, V2 = zweite usw.
          Die Versionsnummer hat <strong>nichts</strong> mit dem Fassungs-Label zu tun.
        </p>

        <h3 style={h3}>Zwei Zaehlmodi (konfigurierbar in DK-Settings)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: C.blue }}>Globale Zaehlung</div>
            <div style={{ ...tree, padding: '10px 14px', fontSize: 11, lineHeight: 1.9 }}>
              <div>Storyline <span style={{ color: C.blue }}>V1</span></div>
              <div>Drehbuch&nbsp;&nbsp;<span style={{ color: C.blue }}>V2</span></div>
              <div>Drehbuch&nbsp;&nbsp;<span style={{ color: C.blue }}>V3</span></div>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Alle Typen zaehlen gemeinsam hoch</div>
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8, color: C.orange }}>Zaehlung pro Typ</div>
            <div style={{ ...tree, padding: '10px 14px', fontSize: 11, lineHeight: 1.9 }}>
              <div>Storyline <span style={{ color: C.orange }}>V1</span></div>
              <div>Drehbuch&nbsp;&nbsp;<span style={{ color: C.orange }}>V1</span></div>
              <div>Drehbuch&nbsp;&nbsp;<span style={{ color: C.orange }}>V2</span></div>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Jeder Typ zaehlt separat, immer ab V1</div>
          </div>
        </div>

        <WarnBox title="Versionsnummer ≠ Arbeitsschritt">
          Drei Drehbuchversionen (V1–V3) koennen alle denselben Arbeitsschritt „Edit 1" haben — wenn
          das Team viele kleine Korrekturen braucht, aber noch in derselben Phase arbeitet.
          Die Versionsnummer misst Quantitaet, das Label beschreibt Qualitaet des Stands.
        </WarnBox>
      </div>

      {/* ── 4. Fassungs-Labels ── */}
      <div style={card}>
        <h2 style={h2}>4. Fassungs-Labels — Semantische Arbeitsschritte</h2>
        <p style={p}>
          Ein Fassungs-Label beschreibt den <strong>Arbeitsschritt</strong> im Produktions-Workflow —
          nicht wieviele Versionen es gab, sondern <em>wo man steht</em>. Labels werden pro Produktion
          in der Drehbuchkoordination definiert und in einer frei konfigurierbaren Reihenfolge geordnet.
        </p>

        <h3 style={h3}>Beispiel-Konfiguration (stage_labels)</h3>
        <div style={{ border: `2px solid ${C.purple}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ background: C.purple, color: '#fff', fontWeight: 700, fontSize: 11, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: 0.3 }}>
            <span style={{ fontFamily: 'monospace', opacity: 0.8 }}>TABLE</span>
            <span>stage_labels</span>
            <span style={{ marginLeft: 'auto', fontWeight: 400, opacity: 0.8 }}>produktion_id = "Rote Rosen S40"</span>
          </div>
          <div>
            {[
              { sort_order: 0, name: 'Erstfassung', is_produktionsfassung: false },
              { sort_order: 1, name: 'Edit 1', is_produktionsfassung: false },
              { sort_order: 2, name: 'Edit 2', is_produktionsfassung: false },
              { sort_order: 3, name: 'Drehfassung', is_produktionsfassung: true },
            ].map((row, i) => (
              <div key={row.name} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 1fr',
                padding: '7px 14px', alignItems: 'center', gap: 12,
                borderBottom: i < 3 ? `1px solid ${C.border}` : undefined,
              }}>
                <code style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>sort_order: {row.sort_order}</code>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    display: 'inline-block',
                    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                    background: row.is_produktionsfassung ? C.green + '20' : C.purple + '15',
                    color: row.is_produktionsfassung ? C.green : C.purple,
                    border: `1px solid ${row.is_produktionsfassung ? C.green : C.purple}44`,
                  }}>
                    {row.name}
                    {row.is_produktionsfassung && <span style={{ marginLeft: 4, fontSize: 9 }}>🔒</span>}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {row.is_produktionsfassung ? 'Produktionsfassung → Werkstufe wird gesperrt' : 'Normaler Arbeitsschritt'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <InfoBox title="Labels gelten fuer alle Typen" color={C.purple}>
          Das Label <strong>„Edit 1"</strong> gilt sowohl fuer <em>Storyline</em>-Werkstufen als auch fuer
          <em> Drehbuch</em>-Werkstufen. Eine Storyline kann bei „Edit 1" sein, waehrend das Drehbuch noch
          bei „Erstfassung" ist — oder umgekehrt. Die Labels beschreiben den Stand unabhaengig vom Typ.
        </InfoBox>
      </div>

      {/* ── 5. Grosses Beispiel ── */}
      <div style={card}>
        <h2 style={h2}>5. Zusammenspiel — Vollstaendiges Beispiel</h2>
        <p style={p}>
          Episode 4711 durchlaeuft einen typischen Produktionszyklus. Hier sieht man, wie Werkstufen, Versionen und
          Labels zusammenspielen — und wie dasselbe Label fuer verschiedene Typen vergeben werden kann.
        </p>

        <div style={{ ...tree, marginBottom: 16 }}>
          <div style={{ color: '#888', marginBottom: 6, fontSize: 11 }}>// werkstufen WHERE folge_id = 4711, ORDER BY erstellt_am</div>
          <div style={{ marginBottom: 2 }}>
            <span style={{ color: '#888' }}>id </span>
            <span style={{ color: '#aaa', display: 'inline-block', width: 90 }}>typ</span>
            <span style={{ color: '#aaa', display: 'inline-block', width: 40 }}>v_nr</span>
            <span style={{ color: '#aaa' }}>label</span>
          </div>
          {[
            { typ: 'storyline', color: '#60A5FA', v: 1, label: 'Erstfassung', labelColor: C.purple, note: '' },
            { typ: 'storyline', color: '#60A5FA', v: 2, label: 'Edit 1', labelColor: C.purple, note: '' },
            { typ: 'drehbuch',  color: '#FB923C', v: 1, label: 'Erstfassung', labelColor: C.purple, note: '' },
            { typ: 'drehbuch',  color: '#FB923C', v: 2, label: 'Edit 1', labelColor: C.purple, note: '' },
            { typ: 'drehbuch',  color: '#FB923C', v: 3, label: 'Edit 2', labelColor: C.purple, note: '' },
            { typ: 'drehbuch',  color: '#FB923C', v: 4, label: 'Drehfassung', labelColor: '#4ADE80', note: '← gesperrt (is_produktionsfassung)' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{ color: '#666', marginRight: 8 }}>{i + 1}.</span>
              <span style={{ color: r.color, display: 'inline-block', width: 90 }}>{r.typ}</span>
              <span style={{ color: '#94a3b8', display: 'inline-block', width: 40 }}>V{r.v}</span>
              <span style={{
                display: 'inline-block',
                padding: '1px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                background: r.labelColor + '30', color: r.labelColor, marginRight: 8,
              }}>{r.label}</span>
              {r.note && <span style={{ color: '#666', fontSize: 10 }}>{r.note}</span>}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <InfoBox title="Wichtige Beobachtungen" color={C.blue} style={{ marginTop: 0, marginBottom: 0 }}>
            <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
              <li>Storyline und Drehbuch <strong>zaehlen separat</strong> (V1, V2 je Typ)</li>
              <li>Das Label <strong>„Edit 1"</strong> kommt zweimal vor — einmal je Typ</li>
              <li>Storyline und Drehbuch koennen gleichzeitig bei unterschiedlichen Labels sein</li>
              <li>Gesperrte Werkstufe: Zuweisen von „Drehfassung" (is_produktionsfassung) setzt <code>bearbeitung_status = 'gesperrt'</code></li>
            </ul>
          </InfoBox>
          <InfoBox title="Warum kein festes Mapping V→Label?" color={C.orange} style={{ marginTop: 0, marginBottom: 0 }}>
            Weil niemand vorher weiss, wie viele Versionen es bis zur Drehfassung braucht. Das eine
            Team braucht 2 Korrekturen, das andere 6. Labels beschreiben den <em>Arbeitsschritt</em>,
            nicht die Anzahl — deshalb sind sie entkoppelt.
          </InfoBox>
        </div>
      </div>

      {/* ── 6. Lock-Gate Schwellenwert ── */}
      <div style={card}>
        <h2 style={h2}>6. Rollen-Freigabe Lock-Gate — Wie bestimmt die Reihenfolge, wann das Gate aktiv wird?</h2>
        <p style={p}>
          Das Lock-Gate im Rollen-Freigabe-System verhindert, dass Autoren neue Rollen ohne Freigabe einsetzen,
          sobald das Projekt einen bestimmten Arbeitsschritt erreicht hat. Die Aktivierung haengt von
          <strong> sort_order</strong> ab — nicht von der Versionsnummer.
        </p>

        <h3 style={h3}>Konfiguration (DK-Settings → Rollen-Freigabe)</h3>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { field: 'lock_trigger_fassungslabel', value: '"Edit 2"', desc: 'Ab diesem Label wird das Gate aktiv', color: C.red },
            { field: 'lock_trigger_werkstufen_typ', value: '"drehbuch"', desc: 'Nur fuer diesen Typ wirksam (nicht Storyline)', color: C.orange },
          ].map(f => (
            <div key={f.field} style={{ flex: 1, minWidth: 220, border: `1px solid ${f.color}44`, borderRadius: 8, padding: '10px 14px', background: f.color + '08' }}>
              <code style={{ fontSize: 11, color: f.color, fontWeight: 700 }}>{f.field}</code>
              <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: C.text }}>{f.value}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{f.desc}</div>
            </div>
          ))}
        </div>

        <h3 style={h3}>Was passiert bei jeder Werkstufe?</h3>
        <p style={{ ...p, marginBottom: 12 }}>
          Das System prueft: Ist <code>sort_order</code> des aktuellen Labels &ge; <code>sort_order</code> des konfigurierten
          Trigger-Labels? Und stimmt der Typ ueberein? Nur dann ist das Gate aktiv.
        </p>

        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ background: '#1a1a2e', padding: '8px 14px', display: 'grid', gridTemplateColumns: '120px 80px 120px 60px 80px', gap: 8, fontSize: 10, color: '#888', fontFamily: 'monospace', fontWeight: 600 }}>
            <span>Werkstufe</span><span>Typ</span><span>Label</span><span>sort_order</span><span>Gate?</span>
          </div>
          {[
            { ws: 'Storyline V1', typ: 'storyline', label: 'Edit 1',        so: 1, active: false, reason: 'falscher Typ' },
            { ws: 'Storyline V2', typ: 'storyline', label: 'Edit 2',        so: 2, active: false, reason: 'falscher Typ' },
            { ws: 'Drehbuch V1',  typ: 'drehbuch',  label: 'Erstfassung',   so: 0, active: false, reason: '< Schwellenwert' },
            { ws: 'Drehbuch V2',  typ: 'drehbuch',  label: 'Edit 1',        so: 1, active: false, reason: '< Schwellenwert' },
            { ws: 'Drehbuch V3',  typ: 'drehbuch',  label: 'Edit 2',        so: 2, active: true,  reason: '= Schwellenwert' },
            { ws: 'Drehbuch V4',  typ: 'drehbuch',  label: 'Drehfassung',   so: 3, active: true,  reason: '> Schwellenwert' },
          ].map((r, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 80px 120px 60px 80px',
              padding: '8px 14px', gap: 8, alignItems: 'center',
              borderTop: `1px solid ${C.border}`,
              background: r.active ? C.red + '08' : undefined,
            }}>
              <code style={{ fontSize: 11, color: r.typ === 'drehbuch' ? C.orange : C.blue }}>{r.ws}</code>
              <code style={{ fontSize: 10, color: C.muted }}>{r.typ}</code>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 600,
                background: C.purple + '18', color: C.purple,
                border: `1px solid ${C.purple}33`, width: 'fit-content',
              }}>{r.label}</div>
              <code style={{ fontSize: 11, color: C.muted, textAlign: 'center' }}>{r.so}</code>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                  background: r.active ? C.red + '20' : C.green + '15',
                  color: r.active ? C.red : C.green,
                  border: `1px solid ${r.active ? C.red : C.green}44`,
                }}>
                  {r.active ? 'AKTIV' : 'inaktiv'}
                </span>
                <span style={{ fontSize: 9, color: C.muted }}>{r.reason}</span>
              </div>
            </div>
          ))}
        </div>

        <InfoBox title="Konsequenz: Unterschiedliche Typen schreibgeschuetzt verschieden" color={C.red}>
          Bei Trigger <code>lock_trigger_werkstufen_typ = "drehbuch"</code> koennen Autoren in der
          <strong> Storyline</strong> (egal welches Label) weiterhin frei arbeiten — das Gate gilt
          ausschliesslich fuer Drehbuch-Werkstufen ab dem konfigurierten Arbeitsschritt.
        </InfoBox>
      </div>

      {/* ── 7. Sichtbarkeiten ── */}
      <div style={card}>
        <h2 style={h2}>7. Sichtbarkeiten</h2>
        <p style={p}>Jede Werkstufe hat eine Sichtbarkeitsstufe (<code>werkstufen.sichtbarkeit</code>), die bestimmt, wer das Dokument sehen und bearbeiten darf.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {['Wert', 'Bedeutung', 'Typischer Einsatz'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { stufe: 'privat',  color: C.orange, desc: 'Nur Ersteller sieht es', einsatz: 'Eigener Entwurf, persoenliche Notizen' },
              { stufe: 'team',    color: C.blue,   desc: 'Alle Autoren der Produktion', einsatz: 'Standard fuer Storylines & Drehbuecher' },
              { stufe: 'alle',    color: C.green,  desc: 'Alle Nutzer mit Produktionszugriff', einsatz: 'Finale Fassungen, Drehfassung' },
              { stufe: 'colab',   color: C.purple, desc: 'Echtzeit-Kollaboration (Yjs)', einsatz: 'Gemeinsames Schreiben, Writers Room' },
            ].map(r => (
              <tr key={r.stufe} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px' }}><code style={{ color: r.color, fontWeight: 600 }}>{r.stufe}</code></td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.desc}</td>
                <td style={{ padding: '8px 10px', color: C.muted }}>{r.einsatz}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 8. Produktionsfassung & Sperre ── */}
      <div style={card}>
        <h2 style={h2}>8. Produktionsfassung — das automatische Sperren</h2>
        <p style={p}>
          In den DK-Settings kann ein Label als <strong>Produktionsfassung</strong> markiert werden
          (<code>stage_labels.is_produktionsfassung = true</code>). Wird dieses Label einer Werkstufe
          zugewiesen, wird sie automatisch gesperrt.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ background: C.green + '0a', border: `1px solid ${C.green}44`, borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.green, marginBottom: 8 }}>Beim Zuweisen des Labels</div>
            <ol style={{ ...p, paddingLeft: 18, marginBottom: 0, lineHeight: 2 }}>
              <li><code>bearbeitung_status = 'gesperrt'</code> wird gesetzt</li>
              <li>Editor wird read-only</li>
              <li>Schloss-Icon erscheint in der Szenenleiste</li>
            </ol>
          </div>
          <div style={{ background: C.orange + '0a', border: `1px solid ${C.orange}44`, borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: C.orange, marginBottom: 8 }}>Sperre aufheben</div>
            <p style={{ ...p, marginBottom: 0 }}>
              Nur Nutzer mit der konfigurierbaren <em>Status-Override-Rolle</em> (Admin → Einstellungen) koennen
              <code> bearbeitung_status</code> manuell auf <code>'entwurf'</code> zuruecksetzen.
              Das Entfernen des Labels hebt die Sperre <strong>nicht</strong> automatisch auf.
            </p>
          </div>
        </div>
        <WarnBox>
          Das <strong>Produktionsfassung-Flag</strong> in <code>stage_labels</code> ist etwas anderes als
          das <strong>Lock-Gate</strong> in <code>rollen_freigabe_konfiguration</code>.
          Ersteres sperrt den Editor. Letzteres steuert, ob neue Rollen freigabepflichtig sind.
          Beide koennen gleichzeitig aktiv sein.
        </WarnBox>
      </div>

      {/* ── 9. Revisions-Farben ── */}
      <div style={card}>
        <h2 style={h2}>9. Revisions-Farben (Rote Seiten)</h2>
        <p style={p}>
          Pro Produktion wird in der Drehbuchkoordination eine <strong>Farbsequenz</strong> fuer Revisionen
          (WGA-Standard) definiert. Die Reihenfolge bestimmt die Farbe der naechsten Revision.
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
              background: c.color, border: c.border ? `1px solid ${C.border}` : 'none', color: '#333',
            }}>
              {c.name}
            </div>
          ))}
        </div>
        <div style={{ ...tree, fontSize: 11, lineHeight: 2 }}>
          <div style={{ color: '#888', marginBottom: 4 }}>// Revisionssequenz in export</div>
          <div>Drehbuch V1 <span style={{ color: '#aaa' }}>→</span> Weisse Seiten (Original)</div>
          <div>Drehbuch V2 <span style={{ color: '#A8D8EA' }}>→</span> Blaue Seiten (1. Revision)</div>
          <div>Drehbuch V3 <span style={{ color: '#FFAEC9' }}>→</span> Pinke Seiten (2. Revision)</div>
        </div>
      </div>

      {/* ── 10. Konfiguration ── */}
      <div style={card}>
        <h2 style={h2}>10. Konfiguration — Wo finde ich was?</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              {['Konzept', 'Einstellung', 'Ort', 'DB-Feld'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { konzept: 'Label', setting: 'Labels definieren & Reihenfolge', ort: 'DK → Fassungs-Labels', db: 'stage_labels.sort_order' },
              { konzept: 'Label', setting: 'Als Produktionsfassung markieren', ort: 'DK → Fassungs-Labels', db: 'stage_labels.is_produktionsfassung' },
              { konzept: 'Label', setting: 'Label einer Werkstufe zuweisen', ort: 'Editor-Header → Tag-Icon', db: 'werkstufen.label' },
              { konzept: 'Version', setting: 'Zaehlmodus (global / pro Typ)', ort: 'DK → Allgemein', db: 'produktionen.version_zaehlung' },
              { konzept: 'Sichtbarkeit', setting: 'Sichtbarkeit einer Werkstufe', ort: 'Editor-Header → Badge', db: 'werkstufen.sichtbarkeit' },
              { konzept: 'Lock-Gate', setting: 'Trigger-Label & Typ', ort: 'DK → Rollen-Freigabe', db: 'rollen_freigabe_konfiguration.lock_trigger_*' },
              { konzept: 'Sperre', setting: 'Status-Override-Rolle', ort: 'Admin → Einstellungen', db: '(app_einstellungen)' },
              { konzept: 'Revision', setting: 'Revisions-Farbsequenz', ort: 'DK → Revisions-Farben', db: '(revisions_farben)' },
            ].map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '8px 10px' }}>
                  <Badge color={r.konzept === 'Label' ? C.purple : r.konzept === 'Lock-Gate' ? C.red : r.konzept === 'Version' ? C.blue : C.gray}>
                    {r.konzept}
                  </Badge>
                </td>
                <td style={{ padding: '8px 10px', fontWeight: 500, fontSize: 12 }}>{r.setting}</td>
                <td style={{ padding: '8px 10px' }}><code style={{ fontSize: 10, background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>{r.ort}</code></td>
                <td style={{ padding: '8px 10px' }}><code style={{ fontSize: 10, color: C.muted }}>{r.db}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 11. Workflow-Diagramm ── */}
      <div style={card}>
        <h2 style={h2}>11. Typischer Workflow</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { step: '1', label: 'Import', desc: 'PDF importieren → erstellt Folge + Werkstufe (typ=drehbuch, V1, label=NULL) + Szenen. Kein automatisches Label.', color: C.blue },
            { step: '2', label: 'Label zuweisen', desc: 'Im Editor-Header: „Erstfassung" zuweisen — describes den Arbeitsschritt', color: C.purple },
            { step: '3', label: 'Parallel: Storyline', desc: 'Autoren schreiben Storyline V1 mit Label „Edit 1" — unabhaengig vom Drehbuch', color: C.blue },
            { step: '4', label: 'Redaktion', desc: 'Neue Drehbuch-Werkstufe V2 erstellen, Label „Edit 1" setzen — Aenderungen einarbeiten', color: C.orange },
            { step: '5', label: 'Lock-Gate aktiv', desc: 'Ab „Edit 2" (konfigurierbar): neue Rollen brauchen Freigabe via Rollen-Freigabe-System', color: C.red },
            { step: '6', label: 'Drehfassung', desc: 'Label „Drehfassung" (is_produktionsfassung) zuweisen → Werkstufe wird automatisch gesperrt', color: C.green },
            { step: '7', label: 'Revision', desc: 'Neue Werkstufe (V3) erstellen → naechste Revisionsfarbe wird zugewiesen, geaenderte Szenen markiert', color: C.red },
          ].map((s, i) => (
            <div key={s.step} style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>
                  {s.step}
                </div>
                {i < 6 && <div style={{ width: 2, height: 24, background: C.border }} />}
              </div>
              <div style={{ paddingTop: 4, paddingBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: s.color }}>{s.label}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ── */}
      <Section title="Haeufige Fragen">
        <FaqItem
          q="Warum gibt es nicht einfach nur Versionen — wozu brauche ich Labels?"
          a={<>
            Versionen zaehlen nur <em>wie oft</em> ein Dokument erstellt wurde — sie sagen nichts darueber,
            <em> wo im Workflow</em> man steht. Mit Labels kann das Team auf einen Blick erkennen, ob das
            Dokument bei „Edit 1" oder „Drehfassung" ist, egal ob es V2 oder V7 ist.
          </>}
        />
        <FaqItem
          q="Kann ein Label mehrfach vergeben werden (z.B. zwei Werkstufen mit 'Edit 1')?"
          a={<>
            Ja — innerhalb verschiedener Typen ist das erwuenscht (Storyline Edit 1 + Drehbuch Edit 1
            gleichzeitig). Innerhalb desselben Typs ist es technisch moeglich, aber empfehlenswert nur
            die aktuelle Werkstufe zu labeln.
          </>}
        />
        <FaqItem
          q="Was passiert, wenn ich das Lock-Gate-Label aendere, nachdem Werkstufen schon existieren?"
          a={<>
            Das System prueft bei jedem Editor-Aufruf live via <code>GET /lock-gate?werkstuf_id=X</code>.
            Eine Konfigurationsaenderung wirkt sofort fuer alle — auch fuer bereits bestehende
            Werkstufen. Es gibt keinen manuellen Reset noetig.
          </>}
        />
        <FaqItem
          q="Kann ich Labels umbenennen, nachdem sie bereits Werkstufen zugewiesen sind?"
          a={<>
            Ja — das Umbenennen ist sicher. Der Rename-Dialog in den DK-Einstellungen propagiert die
            Aenderung transaktional: <code>stage_labels.name</code> wird umbenannt,{' '}
            <em>alle</em> Werkstufen der Produktion, die dieses Label tragen, werden mitaktualisiert,
            und falls das Label als Gate-Trigger konfiguriert ist, wird auch dieser Eintrag automatisch
            angepasst. Ein Umbenennen auf einen bereits vorhandenen Namen wird mit einem Fehler abgewiesen.
          </>}
        />
        <FaqItem
          q="Bekommt eine importierte PDF automatisch ein Label?"
          a={<>
            Nein. Ein PDF-Import legt die neue Werkstufe mit <code>label = NULL</code> an — der
            Dateiname wird separat in <code>original_dateiname</code> gespeichert, taucht aber{' '}
            <strong>nie</strong> als Fassungs-Label auf. Das Label muss anschliessend manuell
            im Editor-Header vergeben werden.
          </>}
        />
      </Section>

    </div>
  )
}

export default WerkstufenLabelsTab
