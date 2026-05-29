import { C, Badge, Section, FaqItem, InfoBox, WarnBox } from './_shared'

function SuchenErsetzenTab() {
  const keyStyle: React.CSSProperties = {
    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
    background: 'var(--bg-subtle)', border: '1px solid var(--border)',
    fontSize: 11, fontFamily: 'monospace', fontWeight: 600,
  }

  const chipStyle = (color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 10px', borderRadius: 20,
    background: color + '22', border: `1px solid ${color}55`,
    color: color, fontSize: 11, fontWeight: 600,
  })

  return (
    <div style={{ padding: '28px 0' }}>

      <Section title="Überblick">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted }}>
          <p style={{ marginBottom: 8 }}>
            Die <strong>Suchen & Ersetzen</strong>-Funktion ermöglicht das Finden und Ersetzen von Text
            über verschiedene Ebenen — von der einzelnen Szene bis zu allen Produktionen. Sie erkennt
            automatisch, ob Ihr Suchbegriff ein <strong>Rollenname</strong> oder ein <strong>Motiv</strong> ist,
            und wechselt dann in eine strukturierte Szenenkartenansicht.
          </p>
          <p style={{ marginBottom: 8 }}>
            Öffnen mit <span style={keyStyle}>Ctrl</span> + <span style={keyStyle}>H</span> (Windows)
            oder <span style={keyStyle}>⌘</span> + <span style={keyStyle}>H</span> (Mac).
          </p>
        </div>
      </Section>

      <Section title="Suchen / Ersetzen — Tabs">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Der Dialog hat zwei Tabs. Wechseln Sie bewusst zwischen den Modi:
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, border: `2px solid ${C.blue}`, borderRadius: 8, padding: '12px 16px', background: C.blue + '08' }}>
            <div style={{ fontWeight: 700, color: C.blue, fontSize: 12, marginBottom: 6 }}>Suchen</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Nur Sucheingabe sichtbar. Zeigt Treffer im Text (gelb/orange) oder als Szenenkarten.
              Kombi-Chips stehen zur Verfügung. Schnelle Navigation per Pfeiltasten.
            </div>
          </div>
          <div style={{ flex: 1, border: `2px solid ${C.green}`, borderRadius: 8, padding: '12px 16px', background: C.green + '08' }}>
            <div style={{ fontWeight: 700, color: C.green, fontSize: 12, marginBottom: 6 }}>Ersetzen</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Zusätzlich ein Ersetzen-Feld. Einzeln (Annehmen/Überspringen) oder alle auf einmal
              ersetzen. Sondermodus für Rollennamen.
            </div>
          </div>
        </div>
      </Section>

      <Section title="Entity-Erkennung — Smart Search">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Wenn Sie tippen, prüft die App automatisch, ob der Begriff ein bekannter
            <strong> Rollenname</strong> oder ein <strong>Motiv</strong> aus dieser Produktion ist.
            Wird etwas erkannt, erscheint ein Badge unter dem Suchfeld:
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ border: `1px solid ${C.blue}44`, borderLeft: `3px solid ${C.blue}`, borderRadius: 6, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ ...chipStyle(C.blue), fontSize: 10 }}>Rollenname erkannt</span>
              <span style={{ fontSize: 11, color: C.muted }}>BRITTA</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              <strong>Ansicht:</strong> Szenen-Modus (Karten) oder Text-Modus wählbar.<br />
              <strong>Filter:</strong> "Als Filter hinzufügen" — fügt einen blauen Chip in die Chip-Leiste ein.<br />
              Im Szenen-Modus sehen Sie alle Szenen, in denen die Rolle vorkommt (via scene_characters),
              nicht unendlich viele Texttreffer.
            </div>
          </div>
          <div style={{ border: `1px solid ${C.green}44`, borderLeft: `3px solid ${C.green}`, borderRadius: 6, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ ...chipStyle(C.green), fontSize: 10 }}>Motiv erkannt</span>
              <span style={{ fontSize: 11, color: C.muted }}>CAFE ROSA</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Zeigt alle Szenen, die in diesem Motiv spielen. Als Filter-Chip hinzufügbar.
            </div>
          </div>
        </div>

        <InfoBox title="Tipp">
          Suchen Sie nach "BRITTA" — statt tausender Dialog-Zeilen sehen Sie nur die Szenen,
          in denen Britta wirklich auftritt. Das ist der Szenen-Modus.
        </InfoBox>
      </Section>

      <Section title="Kombi-Suche mit Chips">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Unterhalb des Suchfeldes gibt es eine <strong>Chip-Leiste</strong> für strukturierte Kombinationssuche.
            Beispiel: <em>"Finde alle Nacht-Szenen im Innenraum, in denen Britta und Richard vorkommen."</em>
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          <span style={chipStyle(C.blue)}>Rolle: BRITTA</span>
          <span style={chipStyle(C.blue)}>Rolle: RICHARD</span>
          <span style={chipStyle(C.green)}>Motiv: CAFE ROSA</span>
          <span style={chipStyle('#FF9500')}>I/A: Innen</span>
          <span style={chipStyle('#AF52DE')}>DT: Nacht</span>
        </div>

        <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
          Chips hinzufügen über die <strong>+ Chip-Leiste</strong>:
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: '+ Rolle', color: C.blue, desc: 'Texteingabe → Autovervollständigung aus Rollenliste' },
            { label: '+ Motiv', color: C.green, desc: 'Texteingabe → Autovervollständigung aus Motivliste' },
            { label: '+ I/A', color: '#FF9500', desc: 'Innen / Außen / Innen-Außen' },
            { label: '+ DT', color: '#AF52DE', desc: 'Tag / Nacht / Dämmerung / Morgen' },
          ].map(({ label, color, desc }) => (
            <div key={label} style={{ border: `1px solid ${color}44`, borderRadius: 6, padding: '8px 12px', background: color + '08', minWidth: 120 }}>
              <div style={{ fontWeight: 700, color, fontSize: 11, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          Mehrere Rollen-Chips werden mit <strong>UND</strong> verknüpft (Szene muss alle enthalten).
          I/A und DT filtern die Szenenmetadaten direkt. Ein Freitext-Suchbegriff im Eingabefeld
          wird zusätzlich als Volltextfilter über den Szeneninhalt angewendet.
        </div>
      </Section>

      <Section title="Ergebnisansichten">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          Je nach Suchmodus erscheinen unterschiedliche Ergebnisansichten:
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
              Textsuche — Snippet-Ansicht
            </div>
            <div style={{ padding: 12, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Für normale Textsuche ohne Entity-Erkennung. Treffer erscheinen als Textauszüge,
              gruppiert nach Episode. Klick navigiert direkt zur Szene.
              <br />
              Im Review-Modus (Ersetzen) erscheinen Annehmen/Überspringen-Buttons pro Treffer.
            </div>
            <div style={{ padding: '6px 12px 6px 24px', borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontWeight: 500, fontSize: 11 }}>Sz. 3</span>
              <span style={{ color: C.muted, fontSize: 10 }}> (Cafe) — Drehbuch v2</span>
              <div style={{ color: C.muted, fontSize: 10, marginTop: 2 }}>
                ...MARTHA betritt das <span style={{ background: '#ffe566', padding: '0 2px', borderRadius: 2 }}>Cafe</span> und...
              </div>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', fontWeight: 600, fontSize: 12, borderBottom: `1px solid ${C.border}` }}>
              Szenenkartenansicht (Entity/Kombi)
            </div>
            <div style={{ padding: 12, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Für Rollen-/Motivsuche und Kombi-Chips. Zeigt Szenenkarten mit Metadaten:
              Szenennummer, Motiv, I/A, DT, beteiligte Rollen, Werkstufe. Klick navigiert zur Szene.
            </div>
            <div style={{ padding: '8px 12px', borderTop: `1px solid ${C.border}`, background: '#00000005' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 11 }}>Sz. 12</span>
                  <span style={{ color: C.muted, fontSize: 10, marginLeft: 8 }}>CAFE ROSA · Innen · Tag</span>
                </div>
                <span style={{ fontSize: 10, color: C.muted, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>Drehbuch v3</span>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span style={chipStyle(C.blue)}>BRITTA</span>
                <span style={chipStyle(C.blue)}>RICHARD</span>
                <span style={{ fontSize: 10, color: C.muted, alignSelf: 'center' }}>+2 weitere</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Scope-Ebenen">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[
            { scope: 'Aktuelle Szene', desc: 'Sucht nur im aktuell geöffneten Editor. Treffer werden direkt im Text hervorgehoben (gelb = Treffer, orange = aktiver Treffer).', color: C.blue },
            { scope: 'Episode / Folge', desc: 'Sucht in allen Szenen der aktuellen Episode in der ausgewählten Werkstufe.', color: C.green },
            { scope: 'Block', desc: 'Sucht in allen Episoden eines Blocks. Werkstufen-Fallback greift bei fehlenden Fassungen.', color: C.orange },
            { scope: 'Staffel / Produktion', desc: 'Sucht in allen Episoden einer Produktion. Immer die neueste Werkstufe (Drehbuch > Storyline > andere).', color: C.purple },
            { scope: 'Alle Produktionen', desc: 'Sucht über alle Produktionen/Staffeln. Immer die letzte Fassung.', color: C.red },
          ].map(s => (
            <div key={s.scope} style={{ border: `1px solid ${s.color}44`, borderLeft: `3px solid ${s.color}`, borderRadius: 6, padding: '8px 14px', background: s.color + '08' }}>
              <strong style={{ color: s.color, fontSize: 12 }}>{s.scope}</strong>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{s.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6, padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6 }}>
          <strong>Werkstufen-Priorität:</strong> Drehbuch (höchste Version) &gt; Storyline (höchste Version) &gt; andere Typen.
          Datum spielt keine Rolle — eine neuere Storyline verdrängt kein älteres Drehbuch.
        </div>
      </Section>

      <Section title="Freie Dokumente">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          Bei Scope <strong>Staffel/Produktion</strong> oder <strong>Alle Produktionen</strong>
          erscheinen zwei optionale Checkboxen:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 14, height: 14, border: `2px solid ${C.blue}`, borderRadius: 3, background: C.blue, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 11 }}>Freie Dokumente einschließen</div>
              <div style={{ fontSize: 10, color: C.muted }}>Sucht auch in freien Dokumenten (nicht an Episoden gebunden)</div>
            </div>
          </div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 14, height: 14, border: `2px solid ${C.border}`, borderRadius: 3, flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 11 }}>Eigene private Dokumente einschließen</div>
              <div style={{ fontSize: 10, color: C.muted }}>Nur aktiv wenn "Freie Dokumente" aktiv. Schließt Ihre persönlichen privaten Dokumente ein.</div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Ersetzen — Annehmen / Überspringen">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Im Tab <strong>Ersetzen</strong> können Sie jeden Treffer einzeln entscheiden:
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div style={{ border: `1px solid ${C.green}44`, borderLeft: `3px solid ${C.green}`, borderRadius: 6, padding: '8px 14px' }}>
            <strong style={{ color: C.green, fontSize: 12 }}>Annehmen</strong>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Ersetzt diesen Treffer und springt automatisch zum nächsten.
            </div>
          </div>
          <div style={{ border: `1px solid ${C.muted}44`, borderLeft: `3px solid ${C.muted}`, borderRadius: 6, padding: '8px 14px' }}>
            <strong style={{ color: C.text, fontSize: 12 }}>Überspringen</strong>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Lässt diesen Treffer unverändert und springt zum nächsten.
            </div>
          </div>
          <div style={{ border: `1px solid ${C.blue}44`, borderLeft: `3px solid ${C.blue}`, borderRadius: 6, padding: '8px 14px' }}>
            <strong style={{ color: C.blue, fontSize: 12 }}>Alle verbleibenden annehmen</strong>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
              Ersetzt alle noch nicht entschiedenen Treffer auf einmal.
            </div>
          </div>
        </div>

        <div style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 6, fontSize: 11, color: C.muted, marginBottom: 12 }}>
          <strong>Fortschrittsanzeige:</strong> "3 angenommen · 1 übersprungen · 8 verbleibend"
        </div>

        <WarnBox title="Gesperrte Szenen">
          Episoden mit aktivem Lock werden beim Ersetzen automatisch übersprungen
          und in der Zusammenfassung als "gesperrt" angezeigt.
        </WarnBox>
      </Section>

      <Section title="Rollennamen ersetzen (Sondermodus)">
        <div style={{ fontSize: 12, lineHeight: 1.7, color: C.muted, marginBottom: 12 }}>
          <p style={{ marginBottom: 8 }}>
            Wenn ein <strong>Rollenname erkannt</strong> wurde und Sie im Ersetzen-Tab sind,
            erscheint eine zusätzliche Auswahl:
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <div style={{ border: `2px solid ${C.blue}`, borderRadius: 8, padding: '12px 16px', background: C.blue + '08' }}>
            <div style={{ fontWeight: 700, color: C.blue, fontSize: 12, marginBottom: 6 }}>
              Nur Rollennamen-Elemente ersetzen (empfohlen)
            </div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              Ersetzt <strong>ausschließlich</strong> die strukturierten Rollennamen-Nodes im Tiptap-Dokument
              (Typ: <code>screenplay_element[element_type='character']</code> oder gleichwertige Absatz-Formate).
              <br /><br />
              Aktualisiert außerdem:
              <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                <li>Die <code>characters</code>-Tabelle (globaler Rollenname)</li>
                <li>Die <code>scene_characters</code>-Tabelle (alle Szenenverknüpfungen)</li>
                <li>Rollennamen-Nodes in allen Szeneninhalten dieser Produktion</li>
              </ul>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>Gesamten Text ersetzen</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              Normaler Textersatz — findet alle Vorkommen des Namens im Klartext, auch in Dialogen.
              Vorsicht: Kann ungewollte Treffer erzeugen (z.B. wenn der Name in einer Regieanweisung vorkommt).
            </div>
          </div>
        </div>

        <InfoBox title="Beispiel">
          "BRITTA" → "BRITTA-MARIA": Im Sondermodus werden nur die Rollennamen-Elemente geändert,
          nicht jede Dialogzeile, die den Namen enthält.
        </InfoBox>
      </Section>

      <Section title="Suchoptionen">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Option</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Beschreibung</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Groß-/Kleinschreibung', 'Unterscheidet zwischen "Martha" und "MARTHA". Standardmäßig aus.'],
              ['Nur ganze Wörter', 'Findet "Rosen" nicht in "Rosenstrauch". Nutzt Wortgrenzen.'],
              ['Reguläre Ausdrücke', 'Erlaubt Regex-Patterns wie z.B. MARTHA|MARIA oder Szene\\s\\d+.'],
            ].map(([opt, desc]) => (
              <tr key={opt} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px', fontWeight: 500, whiteSpace: 'nowrap' }}>{opt}</td>
                <td style={{ padding: '6px 8px', color: C.muted }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Tastenkürzel">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Kürzel</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Ctrl/⌘ + H', 'Suchen & Ersetzen öffnen/schließen'],
              ['Enter', 'Nächster Treffer'],
              ['Shift + Enter', 'Vorheriger Treffer'],
              ['Escape', 'Dialog schließen'],
            ].map(([key, action]) => (
              <tr key={key} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px' }}>
                  <span style={keyStyle}>{key}</span>
                </td>
                <td style={{ padding: '6px 8px', color: C.muted }}>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Regex-Beispiele">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${C.border}` }}>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Pattern</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600, color: C.text }}>Findet</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['MARTHA|MARIA', 'Beide Namen'],
              ['Szene\\s\\d+', '"Szene 1", "Szene 42" etc.'],
              ['\\b\\d{2}:\\d{2}\\b', 'Uhrzeiten wie "14:30"'],
              ['(Dr\\.|Prof\\.)\\s\\w+', '"Dr. Müller", "Prof. Schmidt"'],
              ['^INT\\.', 'Zeilen die mit "INT." beginnen'],
            ].map(([pattern, finds]) => (
              <tr key={pattern} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}><code>{pattern}</code></td>
                <td style={{ padding: '6px 8px', color: C.muted }}>{finds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Häufige Fragen">
        <FaqItem
          q="Warum sehe ich Szenenkarten statt Textschnipsel?"
          a="Wenn ein Rollenname oder Motiv erkannt wurde, wechselt die Ansicht automatisch in den Szenen-Modus. Dort sehen Sie alle Szenen, in denen die Rolle/das Motiv vorkommt — strukturiert und übersichtlich, ohne endlose Dialoglisten. Sie können oben im Badge zwischen 'Szenen' und 'Text' umschalten."
        />
        <FaqItem
          q="Ich suche nach einem Rollennamen, aber die Entity-Erkennung springt nicht an."
          a="Die Erkennung läuft nach ca. 500ms Eingabepause. Der Name muss exakt so vorhanden sein wie in der characters-Tabelle (Groß-/Kleinschreibung wird ignoriert). Wenn der Name in dieser Produktion nicht existiert, erscheint kein Badge — Sie suchen dann normal im Text."
        />
        <FaqItem
          q="Was passiert beim Rollenname-Ersetzen mit gesperrten Episoden?"
          a="Gesperrte Szenen werden beim Inhalt übersprungen. Die characters- und scene_characters-Tabellen werden trotzdem aktualisiert. Der Szeneninhalt gesperrter Episoden bleibt unverändert — die Änderung muss dort manuell nachgezogen werden."
        />
        <FaqItem
          q="Kann ich mehrere Rollen gleichzeitig suchen?"
          a="Ja — fügen Sie mehrere Rollen-Chips hinzu (+ Rolle). Die Suche findet dann alle Szenen, in denen alle dieser Rollen gleichzeitig vorkommen (UND-Verknüpfung)."
        />
        <FaqItem
          q="Was bedeutet 'Werkstufen-Priorität'?"
          a="Bei Suche über Block/Staffel/Alle wird pro Episode immer die beste verfügbare Fassung verwendet: Drehbuch (höchste Versionsnummer) hat Vorrang vor Storyline, Storyline vor anderen Typen. Das Erstellungsdatum spielt keine Rolle."
        />
      </Section>
    </div>
  )
}

export default SuchenErsetzenTab
