-- Migration v143: Default-Prompts für Synopsis-KI-Funktionen ergänzen
-- Die Prompts waren bisher hardcodiert im Backend und konnten nicht bearbeitet werden.

UPDATE ki_settings SET
  default_prompt = 'Du bist Redakteur einer deutschen TV-Soap (ARD Soap).
Schlage genau 5 verschiedene Episodentitel für Folge {{folge_nummer}} vor.

REGELN:
- Genau 5 Titel, einer pro Zeile, keine Nummerierung
- Keinerlei Erklärungen, Kommentare oder Formatierungszeichen
- Jeder Titel: 2-5 Wörter, prägnant, kein Spoiler
- Stil einer deutschen TV-Soap

SZENEN-ZUSAMMENFASSUNGEN:
{{szenen_liste}}'
WHERE funktion = 'synopsis_titel' AND (default_prompt IS NULL OR default_prompt = '');

UPDATE ki_settings SET
  default_prompt = 'Du bist Redakteur einer deutschen TV-Soap (ARD Soap).
Schreibe eine kurze Episodensynopse für das Fernsehprogramm (Folge {{folge_nummer}}).
Zielgruppe: Zuschauende.

REGELN:
- Maximal 300 Wörter, Präsens
- KEINE Überschrift, kein Titel, kein Vorspann
- KEINERLEI Formatierungszeichen: kein *, kein **, kein #, keine Sternchen
- Fließtext, spannend und neugierig machend
- Kein Spoiler zur Cliffhanger-Auflösung

SZENEN-ZUSAMMENFASSUNGEN:
{{szenen_liste}}'
WHERE funktion = 'synopsis_kurz' AND (default_prompt IS NULL OR default_prompt = '');

UPDATE ki_settings SET
  default_prompt = 'Du bist Dramaturg einer deutschen TV-Soap (ARD Soap).
Schreibe eine ausführliche dramaturgische Episodensynopse für die interne Redaktion (Folge {{folge_nummer}}).
Zielgruppe: Autoren, Redaktion und Produktionsleitung.

REGELN:
- 400-600 Wörter, Präsens
- KEINE Überschrift, kein Titel, kein Vorspann
- KEINERLEI Formatierungszeichen: kein *, kein **, kein #, keine Sternchen, kein Markdown
- Rollennamen ausschließlich in GROSSBUCHSTABEN (z.B. LOU, DANIEL, BRITTA)
- Ein Absatz pro Handlungsstrang
- Strukturmarker am Absatzanfang: CLIFF für Cliffhanger-Strang, PEN für Pending-Strang
- Kann Spoiler enthalten
- Dramaturgisch aufgebaut

SZENEN-ZUSAMMENFASSUNGEN:
{{szenen_liste}}'
WHERE funktion = 'synopsis_lang' AND (default_prompt IS NULL OR default_prompt = '');

UPDATE ki_settings SET
  default_prompt = '=== SZENEN-ZUSAMMENFASSUNGEN FOLGE {{folge_nummer}} ===
{{szenen_liste}}

Erstelle folgende 5 Ausgaben EXAKT in diesem Format (Abschnitte durch ###MARKER### getrennt):

###TITEL###
[Titel 1: 1-3 Wörter, NICHT beschreibend, am Stil der bisherigen Titel orientiert]
[Titel 2]
[Titel 3]
[Titel 4]
[Titel 5]

###KURZINHALT###
**Haupthandlung:**
[2-3 Sätze zur zentralen Handlung, Präsens, keine Markdown-Artefakte]

**Nebenhandlungen:**
[1-2 Sätze pro Nebenstrang, Präsens]

**Cliffhanger:**
[1 kurzer Satz, Spannung aufbauen ohne Auflösung zu verraten]

###REDAKTION###
[Dramaturgische Inhaltsangabe. Kein blumiger Stil. Rollennamen IMMER in GROSSBUCHSTABEN. Fokus: Was wollen die Figuren (Want), was brauchen sie (Need)? Cause-and-Effect zwischen Strands. Ein Absatz pro Strang. CLIFF für Cliffhanger-Strang, PEN für Pending-Strang. Präsens, aktiv, 300-500 Wörter. Keine Sternchen oder Markdown.]

###PRESSE###
[60-80 Wörter. Fließend, werblich, Neugier weckend. Kein Spoiler. Keine Markdown-Formatierung.]

###STRAENGE###
[Pro Handlungsstrang eine Zeile: "FIGURENNAME: Kurzbeschreibung" — maximal 100 Zeichen pro Zeile. Keine Markdown-Formatierung.]'
WHERE funktion = 'synopsis_alle' AND (default_prompt IS NULL OR default_prompt = '');
