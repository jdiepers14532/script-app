# Konzept: Figuren- & Motiv-Freigabe, Komparsen-Klassifizierung & NT-Handling

> Script-App (`script.serienwerft.studio`) · Stand: 2026-05-31
> Ersetzt die offenen Fragen aus Abschnitt 7 des Ausgangskonzepts durch getroffene Entscheidungen.
> Branchenabgleich (Yamdu, WGA-Revisionsfarben, Komparsen-Tarif) als Begründung in Abschnitt 13.

---

## 0. Kernentscheidungen auf einen Blick

| Thema | Entscheidung |
|---|---|
| Freigabe-Scopes | **Zwei getrennte Scopes**: Budget/Inhalt und Dispo/Logistik |
| Budget-Trigger | Neue Rolle oder neues Motiv (noch nicht in DB) → **vor dem Lock** |
| Dispo-Trigger | Cast-Änderung oder neue Szene **nach dem Lock** (rote Seite) |
| Budget-Ablehnung | **global** (gilt produktionsweit für alle Szenen) |
| Dispo-Ablehnung | **szenenlokal** (nur die betroffene Szene) |
| Ablehnung allgemein | **klebrig** (nur additives Flag, keine Datenänderung) **und reaktivierbar** (erneute Anfrage) |
| Entfernung einer Rolle | **nur durch Autor/Editor** (Umschreiben), nie durch das System |
| Farb-Ampel im Editor | **Orange = ausstehend**, **Rot = abgelehnt**, bestätigt = neutral; Rot vor Orange; Berechnung **pro Vorkommen** |
| Quorum | **First-Responder**: eine Instanz genügt – für Freigabe **und** Ablehnung |
| Genehmiger-Stufen | **obligatorisch / review (beratend) / notify-only** |
| Genehmiger-Konfiguration | **pro Produktion** in den DK-Settings, je Eintrag `user_id` **oder** `rolle` |
| Komparse o.T. | keine Einzelfreigabe, nur Mengenkontrolle (Einsätze pro Motiv pro Block); **Default unbegrenzt = Funktion aus** |
| Komparse mit Text / mit Spiel | freigabepflichtig; Einstufung **aus dem Inhalt abgeleitet** (Mistral) |
| Lock-Gate | hart, Override **in DK-Settings geregelt** (engere Gruppe), mit Pflichtbegründung + Audit |
| Anlage/Bearbeitung Rollen/Figuren/Motive | **kein hartcodiertes Gate** — in DK-Settings konfigurierbar, wer anlegen/bearbeiten darf; Anlage **und** Kategorie-Hochstufung werden auditiert |
| Rote-Seiten-Gate | hart, mit **auditiertem Override + Doppelbestätigung**; zeigt fehlende Freigaben + zuständige Person |
| Revisionsfarben/Seiten | **bestehende DK-Settings übernehmen**, nicht neu bauen |
| NT bei nicht freigegebener Rolle | wird **nur geflaggt**, nicht gefiltert |
| Glossar | **neu**: zentrales Begriffs-Glossar in den DK-Settings, app-weit als Filter/Tooltip nutzbar |

---

## 1. Zwei-Scope-Modell

Eine im Editor verwendete Figur/Motiv kann zwei verschiedene Freigaben auslösen:

- **Scope Budget / Inhalt (Fall B)** — die Rolle bzw. das Motiv **existiert noch nicht** in der jeweiligen Datenbank. Es ist eine Budgetfrage („darf das überhaupt existieren / wird es bezahlt?"). Granularität: **pro Rolle/Motiv und Produktion**, einmalig. Genehmiger: Herstellungs-/Produktionsleitung (konfigurierbar).
- **Scope Dispo / Logistik (Fall A)** — die Rolle **existiert** bereits, taucht aber in einer **neuen Szene** auf, die nach dem Lock dazukommt. Es ist eine logistische Frage („ist diese Szene/Besetzung machbar?"). Granularität: **pro Szene** (`scene_identity_id`). Genehmiger: Drehplanung/Aufnahmeleitung (konfigurierbar).

**Regel:** Eine Budget-Freigabe (B) **schließt die Dispo-Freigabe der Einführungsszene automatisch mit ein**. Erst beim erneuten Auftreten der dann existierenden Rolle in einer weiteren Szene greift Fall A.

**Neue Rolle nach dem Lock:** braucht **nur** eine Budget-Freigabe (neu zu besetzen, Verfügbarkeit wird vor Einstellung ohnehin geprüft). Die Dispo bekommt nur eine **Info** (notify-only), kein Gate.

---

## 2. Phasen & Trigger

```
Storyline schreiben            Lock (Szenenkopf-Log)            Drehbuch / rote Seiten
─────────────────────►  ┃  ──────────────────────►
Budget feuert hier            ┃   Dispo feuert ab hier
(neue Rollen/Motive)          ┃   (Cast-Änderungen, neue Szenen)
```

- **Vor dem Lock**: Es feuert nur **Budget** (neue Rolle/Motiv). Dispo existiert noch nicht, weil es keinen Drehplan gibt, gegen den verstoßen werden könnte. Szenen-Anlegen vor dem Lock ist normales Schreiben und löst **nichts** aus.
- **Lock = Checkpoint**: Der Lock ist gleichzeitig **Auslöser** (Bündelung der Budget-Anfragen) **und Tor** (kann erst gelockt werden, wenn alle Budget-Konflikte gelöst sind).
- **Nach dem Lock**: Cast-Änderungen und neu hinzugefügte Szenen sind **rote Seiten** und feuern **Dispo**. Die Veröffentlichung roter Seiten ist durch das Rote-Seiten-Gate kontrolliert.

### Markierung ≠ Anfrage (wichtige Trennung der Feuer-Kadenz)
- Die **Farbmarkierung** im Editor erscheint **sofort**, sobald eine Rolle/Motiv getippt wird, die nicht in der DB steht (lokal, ohne Nebenwirkung).
- Die **Anfrage** (Inbox-Eintrag + Benachrichtigung) feuert **nicht bei jedem Speichern**, sondern gebündelt am **Checkpoint** (Budget am Lock, Dispo beim Veröffentlichen roter Seiten).
- Optional: manueller Button „Jetzt zur Budgetfreigabe einreichen" für früh bekannte neue Rollen.
- **Keine** separate Zeit-Einstellung (direkt / Szenenwechsel / Tagesende): Der Lock-Zeitpunkt ist über Werkstufe/Fassungslabel in den DK-Settings bereits konfigurierbar; eine zweite Kadenz-Einstellung wäre redundant.

---

## 3. Ablehnung: klebrig, aber reaktivierbar

- Eine Ablehnung ist **keine Datenänderung**: keine Löschung, keine Deaktivierung, keine Kaskade. Nur ein **additives Flag**, das bestehen bleibt.
- Die **Entfernung** einer Rolle aus einer Szene macht **immer der Autor/Editor** durch Umschreiben. Beim nächsten Speichern setzt der Scan den NT-Eintrag auf `veraltet = TRUE` (bestehender Soft-Delete) und zieht offene Anfragen automatisch zurück (siehe Abschnitt 9).
- Ablehnung ist **nicht terminal**: Über die **erneute Anfrage** kann eine abgelehnte Rolle zurück nach „ausstehend". Auslöser kann jeder sein, in der Praxis der Autor. Pflicht: ein Hinweis „was hat sich geändert" (`erneut_anfrage_notiz`), während der Genehmiger den vorherigen Ablehnungsgrund (`notiz`) sieht.
- **Budget-Ablehnung = global** (rot in allen Szenen). **Dispo-Ablehnung = szenenlokal** (rot nur in der betroffenen Szene).
- NT-Einträge einer abgelehnten Rolle bleiben bestehen, werden im NT-Export aber **geflaggt** (siehe Abschnitt 5/NT).

---

## 4. Status- und Farblogik im Editor

Die Farbe wird **pro Vorkommen** (Figur × Szene) berechnet, nicht als einzelnes Flag auf der Rolle:

```
WENN Rolle global budget-abgelehnt              → ROT
SONST WENN (Rolle, Szene) dispo-abgelehnt       → ROT
SONST WENN budget- oder dispo-ausstehend        → ORANGE
SONST                                           → neutral (keine Farbe)
```

- **Rot vor Orange** (abgelehnt ist der stärkere, handlungsfordernde Zustand).
- Budget-Status sitzt auf `character_productions.freigabe_status`, Dispo-Status auf `scene_characters.status`. Die Editor-Farbe = Maximum aus beiden.
- **Phasenabhängig**: Vor dem Lock kann nur die Budget-Achse Farbe zeigen; Dispo-Farben erscheinen erst nach dem Lock.
- **Tooltip am Vorkommen** (bestehende `src/components/Tooltip.tsx`): zeigt Scope (Budget/Dispo), Status und bei Ablehnung den Grund („Budget abgelehnt: bitte Szene ohne diese Rolle schreiben").
- Bestätigt bleibt **neutral** (keine grüne Einfärbung – sonst leuchtet ein fertiges Buch wie ein Weihnachtsbaum; nur Ausnahmen brauchen Aufmerksamkeit).

---

## 5. Komparsen-Klassifizierung (inhaltsbasiert)

Drei Stufen, die den realen Tarif-Stufen entsprechen (siehe Abschnitt 13):

| Stufe | Inhaltssignal | Freigabe? | Kostenlogik |
|---|---|---|---|
| **Komparse o.T.** (ohne Text) | Character-Node **ohne** Dialogue-Node **und** ohne Action-Bezug | Nein, nur Mengenkontrolle | reiner Mengenkostenfaktor |
| **Komparse mit Text** | Character-Node **mit** zugehöriger Dialogue-Node | **Ja** (wie Rolle) | Kleindarsteller-Gage (Tarif) |
| **Komparse mit Spiel** | im **Action-Absatz** erwähnt, KI bestätigt Spielhandlung | **Ja** (wie Rolle) | Silent-Bit-/SOC-Zuschlag |

### Erkennungs-Pipeline
1. **o.T. vs. mit Text** ist deterministisch aus dem Inhalt ableitbar (Dialogue-Node vorhanden oder nicht). Das schließt die Label-Lücke: Der Autor kann eine Sprechrolle nicht als o.T. tarnen.
2. **mit Spiel** hat keinen Dialog, also kein eindeutiges Signal. Erkennung:
   - **Kandidat**: Die Figur wird in einem **Action-/Handlungs-Absatz** erwähnt (deutsche Drehbücher beschreiben Handlungen, auch ohne explizite Schauspielanweisung).
   - **Disambiguierung via Mistral**: Nicht jede Erwähnung bedeutet Spiel. Die Passage geht an Mistral Cloud (über bestehende `ki-settings`-Konfiguration; Ollama zu langsam, 600s-Timeout).
3. **Entity-Linking**: Erwähnung ↔ Figur über die vorhandene Entity-Erkennung; generische Komparsen („ein Kellner") sind der bekannte Härtefall.

### Pflicht-Designregeln für die Mistral-Stufe
- **Präzise, tarifnahe „Spiel"-Definition** im Prompt: **Spiel liegt vor, wenn die Figur in Interaktion tritt oder etwas für die Szene Relevantes tut** (eine Handlung ausführt, die die Szene voranbringt, oder direkt mit einer benannten Figur interagiert — anreichen, anrempeln, übergeben, auf Ansprache reagieren). **Reine Anwesenheit/Atmosphäre ist kein Spiel** („im Hintergrund sitzen Gäste", „Passanten laufen vorbei"). Entspricht dem Upgrade-Kriterium der Gewerkschaften (Abschnitt 13).
- **Recall vor Precision**: lieber über- als unter-melden. Ein Fehlalarm ist harmlos (Genehmiger winkt ab), ein verpasster Spiel-Komparse reißt die Lücke wieder auf. Unsichere Fälle als „nicht inhaltlich verifiziert" zur menschlichen Prüfung markieren, nie still klassifizieren.
- **Nicht auf dem Save-Hotpath**: asynchron bzw. am Lock-Checkpoint laufen lassen.
- **Auditierbar**: Mistral-Urteil + zitierte Textstelle + Konfidenz speichern; menschlicher Override möglich; Korrekturen als Trainingssignal an den KI-Trainer (`POST /api/training-events`).

### NT bei nicht freigegebener Rolle
NT-Einträge entstehen weiterhin sofort (auch für gestagte/abgelehnte Rollen), werden in NT-Liste und -Export aber **geflaggt** (z. B. „Rolle nicht freigegeben"), damit das Tonstudio keine Aufnahme für eine nie kommende Rolle plant.

---

## 6. Mengenkontrolle Komparse o.T. — „Einsätze pro Motiv pro Block"

- o.T.-Komparsen lösen **keine** Einzelfreigabe aus; relevant ist nur die **Menge**.
- Zähleinheit: **Einsätze pro Motiv pro Block** (nicht „pro Drehtag" – Einsätze sind feinkörniger und entsprechen der heutigen Halbtages-/Stundenbuchung besser).
- Schätzlogik (vor Existenz des Drehplans): **eine Gruppe = ein Einsatz pro Motiv**. Der Rest wird mitgezählt.
- **Default-Anzahl** für wiederkehrende Komparsen (z. B. „Gäste im Carla's") in der Komparsendatenbank; szenenspezifische `scene_characters.anzahl` **überschreibt** den Default (Einstellungs-Hierarchie der Suite).
- **Obergrenze pro Block** in den DK-Settings (Zahl oder „unbegrenzt"). Überschreitung = **Warnung** in Dispo/Statistik, **kein** harter Block (o.T. ist eine flexible Stellschraube).
- **Cross-App-Abhängigkeit**: Die Block-Summe braucht die Zuordnung Szene→Drehtag aus der **Live-Dispo**; die endgültige Prüfung lebt dort, in der Script-App nur die Schätzung.

---

## 7. Genehmiger & DK-Settings

### Genehmiger-Tabelle (pro Produktion)
Je Eintrag:
- `freigabe_typ`: `budget | dispo`
- `stufe`: `obligatorisch | review | notify`
- Zuordnung: `user_id` **oder** `rolle` (Rolle ist robust gegen Personalwechsel; konkrete Person braucht Vertretungsregel)

### Drei Stufen
- **obligatorisch** — muss entscheiden, blockiert (Gate).
- **review (beratend)** — Empfehlung, sichtbar am Objekt, blockiert **nicht**.
- **notify-only** — sieht es (FYI), stimmt nicht ab. Genau hier landet die Info zur neuen Rolle nach dem Lock.

### Quorum: First-Responder
- **Eine Instanz genügt** — für Freigabe **und** für Ablehnung. Die erste obligatorische Entscheidung settled den Fall; die offenen Punkte der übrigen Genehmiger werden automatisch zurückgezogen.

### Review-Ablehnung am Objekt
Beratende Stimmen/Bedenken hängen als **inline-Notiz** am Anfrage-Eintrag (Name + „Review · beratend" + Kommentar), optisch deutlich von einer blockierenden Entscheidung getrennt (ruhiger Ton, **kein** Rot). Sie ändert den Status **nicht** – nur die obligatorische Instanz entscheidet.

### Befugnis vs. Sichtbarkeit (orthogonal!)
- Die Genehmiger-Gruppe bestimmt **worüber entschieden wird** (Handlungsbefugnis).
- **Lesesichtbarkeit** kommt weiter **ausschließlich** aus dem Feldgruppen-Modell (G1–G24, `useZugriff`). Sichtbarkeit darf sich **nicht** aus der Freigabe-Gruppe ableiten.
- **Override-Recht** ist getrennt vom **Konfigurationsrecht**; jeder Override wird auditiert.
- **Keine Selbstgenehmigung**: Wer die Anfrage auslöst, darf sie nicht selbst freigeben.

### Was die Freigabe abdeckt (DK-konfigurierbar)
Toggles: `rollen`, `motive`, `neue_szenen` — pro Produktion einzeln aktivierbar.

---

## 8. Freigabe-Seite

- **Matrix-Überblick**: Folgen (X-Achse) × Szenen (Y-Achse), Zellen mit Anzahl offener Punkte, Ampelfarbe (orange/rot). Für 250 Episoden **sparse** (nur Zellen mit offenen Punkten) und gefenstert (aktueller Block).
- **Detailliste** der ausgewählten Zelle: je Eintrag Name, Kontext (Folge/Szene/Motiv), Badges (Kategorie + `Budget · global` / `Dispo · Szene`), Freigeben/Ablehnen, Checkbox für Batch.
- **Batch-Freigabe** ausgewählter Einträge.
- **Scope-Umschalter**: „Meine Freigaben" (personalisiert, nur eigene Stufe) vs. „Alle (DK)" (Gesamtüberblick).
- Cross-Produktions-Sicht für „Meine Freigaben" (Genehmiger sieht alle offenen Punkte über Produktionen hinweg).

---

## 9. Auto-Zurückziehen

Entfernt der Autor/Editor ein Vorkommen aus der Szene, erkennt der Save-Scan das und:
- setzt den zugehörigen **NT-Eintrag** auf `veraltet = TRUE` (Soft-Delete),
- zieht eine **offene Freigabe-Anfrage** automatisch zurück (`zurueckgezogen`), damit kein Genehmiger über eine nicht mehr existierende Rolle entscheidet.

Auto-zurückgezogene Einträge erscheinen in der Inbox kurz als „zurückgezogen (Vorkommen entfernt)", statt kommentarlos zu verschwinden.

---

## 10. Lock-Gate & Rote-Seiten-Gate

### Zwei getrennte Lock-Systeme
- **Bestehendes Lock-System** (per Episode, Contract-Lock via Vertragsdatenbank): öffentliches Rote-Seiten-/Revisionssystem fürs ganze Team. **Wird übernommen, nicht neu gebaut.** Revisionsfarben/Farbcode sind bereits in den DK-Settings angelegt.
- **Neues Freigabe-System**: interne Budget-/Logistik-Kontrolle für wenige Personen, **nicht** über rote Seiten transparent gemacht.

### Kopplung (einseitig)
Die Veröffentlichung neuer roter Seiten ist durch das Freigabe-System **getort**: keine roten Seiten, bevor die nötigen Freigaben vorliegen (oder bei Ablehnung die nötigen Änderungen gemacht sind).

### Lock-Gate (vor dem Lock)
- Pre-Flight-Anzeige: „Kann nicht locken — N Budget-Freigaben ausstehend bei [Person/Rolle]".
- **Override in den DK-Settings geregelt** (analog zur Anlage-/Bearbeitungsberechtigung, Abschnitt 11): nur eine engere Gruppe (typischerweise Herstellungsleitung), **Pflichtbegründung + Audit**. Strenger gehalten als das Rote-Seiten-Gate, da eine ungenehmigte Rolle im Lock folgenreicher ist als eine verzögerte rote Seite.

### Rote-Seiten-Gate (nach dem Lock)
- Zeigt **welche** Freigaben **von wem** fehlen; die veröffentlichende Person kann direkt kommunizieren.
- **Override** mit **Doppelbestätigung** („Wollen Sie wirklich …?") und **Audit-Eintrag** (wer, wann, warum), Markierung an der betroffenen Änderung.

---

## 11. Direkteintrag, Bypass & Zugriffskontrolle

- Der **Normalweg** für budgetierte Rollen/Motive ist der **Direkteintrag in der Prep** (Produktion legt den budgetierten Stamm an). Dieser Akt **ist** die Budgetentscheidung. Die Editor-Freigabe ist der **Ausnahmepfad** für mitten im Schreiben erfundene Rollen.
- Folglich ist das **echte Budget-Gate der Schreibzugriff** auf Rollen-/Motiv-DB. Dieser Zugriff wird **nicht hartcodiert, sondern in den DK-Settings konfiguriert** (orientiert an der bereits vorhandenen, vergleichbaren Berechtigungs-Funktionalität an anderer Stelle in Script): pro Produktion lässt sich festlegen, welche Rollen Figuren/Rollen und Motive **anlegen und bearbeiten** dürfen. Maßgebliche Endpoints: `POST /api/characters`, `POST /api/characters/:id/productions`, **Aktivierung** (`is_active = TRUE`), **Anlegen von Motiven**. Der **Autor** ist standardmäßig **nicht** in diesem Kreis.
- **Sehen und Bearbeiten** der Datenbanken bleibt grundsätzlich offen — aber die Grenze verläuft bei **budgetrelevant vs. kreativ**, nicht bei create-vs-edit: Profilfelder offen (Feldgruppen-Modell), budgetwirksame Mutationen (Anlage, Aktivierung, Produktions-Link, **Kategorie-Hochstufung** z. B. Episodenrolle → Hauptrolle) nur für die DK-berechtigte Gruppe und **auditiert**. Die Kategorie-Hochstufung ist damit eine **Berechtigungsfrage**, kein zusätzliches Gate: Wer die Berechtigung hat, darf hochstufen; jede solche Änderung wird protokolliert.
- **Audit**: Direkteinträge landen im selben Audit-Log wie Freigaben („angelegt + sofort freigegeben (Direkteintrag durch X)"). Optionale Kennzahl: „Rollen außerhalb der Prep angelegt".
- Direkteintrag klärt **nur Budget** — die Dispo-Freigabe fällt post-Lock trotzdem an.

---

## 12. Glossar (neu, in DK-Settings)

Zentrales Begriffs-Glossar, **pro Produktion** pflegbar, **app-weit** als Filter und als Tooltip-/Verständnishilfe an anderer Stelle nutzbar.

**Datenmodell** `glossar`: `begriff`, `abkuerzung`, `definition`, `kategorie` (z. B. `besetzung | ton | werkstufe | dispo | revision`), optional `produktion_id` (NULL = global).

**Seed-Begriffe (in diesem Konzept aufgetaucht):**

| Begriff / Abk. | Bedeutung |
|---|---|
| NT (Nachton) | Stimme, nicht sichtbar; NT-Aufnahme nötig |
| VO (Voice-Over) | Voice-Over |
| OFF | Off-Screen / aus dem Off; NT-Aufnahme nötig |
| ONE-WAY | einseitiges Gespräch; **kein** NT |
| SOC (Silent On Camera) | erscheint im Bild, spricht nicht, kann agieren/reagieren = **Komparse mit Spiel** |
| Silent Bit | Hintergrunddarsteller mit handlungsrelevanter Aktion = Komparse mit Spiel |
| Komparse o.T. | ohne Text; reine Atmosphäre (vgl. Statist) |
| Komparse mit Text | Sprechtext → **Kleindarsteller** (eigener Tarif) |
| Komparse mit Spiel | gespielte Handlung ohne Text (= SOC / Silent Bit) |
| Statist | reiner Hintergrund ohne Handlungsbezug |
| Kleindarsteller / Edelkomparserie | Tarif-Stufen für Komparse mit Text |
| Werkstufe | Drehbuch \| Storyline \| Notiz (+ Version) |
| Fassungslabel | benannte Fassung (Lock-Trigger konfigurierbar) |
| Rote Seiten | hauseigener Begriff für veröffentlichte Revision (Farbcode in DK-Settings) |
| DT (Drehtag) | Drehtag |
| Block (Drehblock) | Drehblock; Bezugsgröße für o.T.-Obergrenze |
| Motiv | Drehort (neu = Motivvertrag C4 = budgetrelevant) |
| Einsätze pro Motiv | Zähleinheit für o.T.-Mengenkontrolle |
| Dispo (Disposition) | Drehplanung/Tagesdispo |
| Fall A / Fall B | intern: Dispo-Freigabe (A) / Budget-Freigabe (B) |
| DK | konfigurierende Genehmiger-Rolle (`requireDkAccess`) — Klartext-Bezeichnung gemäß Hauskonvention ergänzen |

> Hinweis: „Rot" hat bei euch drei Bedeutungen — Status-Rot im Editor (abgelehnt), veröffentlichte rote Seite, und es ist **kein** Standard-Revisionsfarbcode. Im Glossar bewusst entkoppeln.

---

## 13. Branchen-Abgleich (Begründung der Designentscheidungen)

- **Komparsen-Stufen = echte Tarif-Stufen.** Reine Hintergrunddarsteller sind „lebende Requisiten" ohne Handlungsbeitrag (o.T.); im deutschen Sprachgebrauch unterscheidet man Statist (sitzt/agiert ohne Bezug zur Haupthandlung) vom Komparsen (interagiert mit dem Handlungstiming) — eine Trennung, die die Tagespraxis verwischt hat, die der Tarif aber kennt. Sprechtext macht den Kleindarsteller (eigener Tarifvertrag der Allianz Deutscher Produzenten mit gestaffelten Stufen bis „Edelkomparserie"). Das „Silent Bit"/SOC ist die international etablierte „mit Spiel"-Kategorie mit eigenem Zuschlag.
- **Inhaltsbasierte Einstufung = Gewerkschaftspraxis.** Das Upgrade zum Silent Bit erfolgt genau dann, wenn die Figur **im Skript namentlich genannt** wird oder **direkt mit einer Hauptfigur eine Handlung** ausführt (z. B. Kellner serviert einer Hauptfigur). Das ist exakt das Signal, das der Mistral-Scan im Action-Absatz sucht.
- **Revisionsfarben.** WGA-Standardreihenfolge: Weiß → Blau → Rosa → Gelb → Grün → Goldenrod → Buff → Salmon → Cherry → Tan (dann Double-…). **Rot kommt darin nicht vor** → „rote Seiten" ist hauseigen. TV-Serien weichen ohnehin oft ab; der deutsche Markt hat kein verbindliches Format. Übernehmenswerte Standardkonventionen: **Asterisk** für geänderte Zeilen, **Revisions-Historie auf der Titelseite**, **gelockte Seite = eingefroren**.
- **Yamdu validiert die Architektur.** Ein gemeinsames Datenmodell (einmal eingeben → propagiert überall), KI-Erkennung von Figuren/Motiven beim Import, Breakdown-Verteilung erst **nach Freigabe durch die Produktionsleitung**, Budget verknüpft mit Freigaben. Euer Zwei-Scope-Modell mit Pre-/Post-Lock-Trennung und Per-Vorkommen-Status ist feiner als Yamdus einzelnes PM-Gate — ihr verfeinert ein bewährtes Muster.

---

## 14. Geklärte Detailentscheidungen

1. **„Spiel"-Definition** (Mistral-Prompt): Spiel = Figur tritt in Interaktion oder tut etwas für die Szene Relevantes; reine Anwesenheit/Atmosphäre nicht. Siehe Abschnitt 5.
2. **Rollen-Kategorie-Hochstufung** (Episodenrolle → Hauptrolle): kein zusätzliches Gate, sondern **Berechtigungsfrage** über die DK-Settings (wer darf bearbeiten) + **Audit**. Siehe Abschnitt 11.
3. **Anlage/Bearbeitung von Rollen, Figuren, Motiven**: **kein hartcodiertes Gate** — in den DK-Settings konfigurierbar, orientiert an der bereits vorhandenen vergleichbaren Berechtigungs-Funktionalität in Script. Anlage auditiert. Siehe Abschnitt 11.
4. **Lock-Gate-Override**: in den DK-Settings geregelt, engere Gruppe (z. B. Herstellungsleitung), Pflichtbegründung + Audit; strenger als das Rote-Seiten-Gate. Siehe Abschnitt 10.
5. **o.T.-Obergrenze**: reine Warnung (kein Hard-Block); **Default „unbegrenzt" = Funktion faktisch aus**, jede Produktion setzt selbst. Siehe Abschnitt 6.

### Verbleibend (nicht blockierend, von Claude Code zu erfragen)
- **DK-Klartext**: ausgeschriebene Bezeichnung der DK-Rolle fürs Glossar — Claude Code erfragt dies beim Anlegen des Glossars (Phase 8).
