-- v182: Glossar — "Im Unterbruch" (neu) + Continuous Action (CA) erklaerung_lang
--
-- 1. "Im Unterbruch" als neuer Eintrag (Kategorie dramaturgie, kein Kürzel)
-- 2. CA-Default um erklaerung_lang + quellen erweitern
-- 3. CA-Produktionskopien propagieren (nur wenn erklaerung_lang noch leer)

-- ── 1. Im Unterbruch (neu) ────────────────────────────────────────────────────
INSERT INTO dk_glossar_defaults (kuerzel, name, erklaerung, erklaerung_lang, quellen, term_en, kategorie, sort_order)
SELECT
  '',
  'Im Unterbruch',
  'Ereignis oder Zustandsänderung, die während eines dramaturgischen Unterbruchs (Wegschnitt auf anderen Strang) stattfindet — und vom Zuschauenden nicht gesehen wird. Beim Zurückkehren zur Szene ist etwas passiert; die Handlung läuft nicht als Continuous Action weiter.',
  $LANG$## Kernbedeutung

"Im Unterbruch" bezeichnet alles, was in der erzählten Realität einer Szene passiert, während der Zuschauende weggeschnitten ist (= während des dramaturgischen Unterbruchs auf einen anderen Strang). Der Zuschauende sieht das Ereignis nicht — er sieht nur das Resultat, wenn die Kamera zur Szene zurückkehrt.

Die Handlung ist damit explizit KEIN Direkter Pick-Up (DPU) / keine Continuous Action. Zeit ist vergangen, und in dieser Zeit ist etwas Off-Screen geschehen.

## Abgrenzung zu DPU / CA

• **DPU (Direkter Pick-Up) / CA**: Kein Zeitsprung. Was wir beim Wegschneiden sehen, setzt beim Zurückkehren nahtlos fort — als wäre kein Schnitt gewesen.
• **Im Unterbruch**: Zeitsprung. Die Szene setzt nicht nahtlos fort. Etwas hat sich verändert: eine Figur ist gegangen, eine Entscheidung wurde getroffen, ein Gegenstand wurde bewegt — ohne dass wir es gesehen haben.

## Abgrenzung zu IPU (Indirekter Pick-Up)

Der IPU beschreibt die Technik (Strang wird mit Zeitsprung wieder aufgenommen). "Im Unterbruch" beschreibt das Inhaltliche: was in der Zeitlücke passiert ist. Ein IPU kann mit oder ohne benannte "Im Unterbruch"-Ereignisse zurückkehren.

## Abgrenzung zu OFF

OFF = Figur ist im Szenenbild, aber nicht im Kaderrahmen sichtbar. "Im Unterbruch" = Ereignis passiert komplett außerhalb der erzählten Szene, während die Kamera weggeschnitten ist.

## Typische Anwendungsfälle

• Zwei Figuren streiten → Unterbruch auf anderen Strang → Rückkehr: eine Figur hat den Raum verlassen ("IM UNTERBRUCH hat Anna die Wohnung verlassen")
• Figur liest Brief → Unterbruch → Rückkehr: Figur ist sichtlich erschüttert, Brief liegt zerrissen auf dem Tisch
• Figur bereitet Abendessen vor → Unterbruch → Rückkehr: Tisch ist gedeckt, Kerzen brennen — offensichtlich ist Zeit vergangen

## Notation im Skript

Regieanweisung in der zurückkehrenden Szene, z. B.:
IM UNTERBRUCH: Anna hat die Wohnung verlassen. Nur Mikes Jacke liegt noch auf dem Sofa.

Alternativ als implizite Spielanweisung ohne expliziten Marker, wenn das visuelle Ergebnis selbsterklärend ist.$LANG$,
  '',
  'Off-screen ellipsis / During the cut',
  'dramaturgie',
  154
WHERE NOT EXISTS (
  SELECT 1 FROM dk_glossar_defaults WHERE name = 'Im Unterbruch' AND kategorie = 'dramaturgie'
);

-- ── 2. CA-Default: erklaerung_lang + quellen setzen ──────────────────────────
UPDATE dk_glossar_defaults
SET
  erklaerung_lang = $LANG$## Kernbedeutung

Continuous Action (CA) bedeutet: zwischen zwei aufeinanderfolgenden Szenen (oder nach einem Wechselschnitt) vergeht keine Zeit. Die Handlung setzt nahtlos fort — es gibt keinen Zeitsprung, keine Off-Screen-Lücke, keine "im Unterbruch" geschehenen Ereignisse.

## Notation im Drehbuch

• **Deutsche Produktionspraxis**: Kürzel CA hinter oder anstelle der Zeitangabe in der Szenenüberschrift — z. B. INT. WOHNZIMMER — CA
• **US-Format**: CONTINUOUS in der Slugline statt DAY/NIGHT — z. B. INT. LIVING ROOM — CONTINUOUS
• **Dialogfortsetzung**: CONT'D (≠ CONTINUOUS) ist ein separates Kürzel für unterbrochene Dialogzeilen desselben Sprechers — nicht zu verwechseln mit CA

## Anwendungsfälle

• Figur bewegt sich durch mehrere Räume ohne erzählte Pause (z. B. geht von Küche ins Wohnzimmer)
• Wechselschnitt (WS) endet → Strang läuft nahtlos weiter: DPU = Direkter Pick-Up = CA
• Eröffnungsszene einer Folge knüpft nahtlos an den Cliffhanger der Vorfolge an: DPU. (Punkt-Variante)
• Verfolgungs- oder Aktionssequenz über mehrere Locations ohne Zeitlücke

## Abgrenzung

• **CA ≠ IPU (Indirekter Pick-Up)**: IPU = Zeit ist vergangen; CA = keine Zeit vergangen
• **CA ≠ "Im Unterbruch"**: Im Unterbruch = Off-Screen-Geschehen während eines Zeitsprungs; CA = kein Zeitsprung
• **CA ≠ SAME (US-Format)**: SAME bezeichnet denselben Ort zur selben Zeit — CA ist eine Zeitaussage, keine Ortsaussage. Eine Szene kann CA sein und trotzdem an einem anderen Ort spielen (z. B. Verfolgungsjagd durch die Stadt)

## Zusammenhang mit dem Unterbruch-System

In der Zopfdramaturgie: CA ist die Aussage "dieser Strang wurde weggeschnitten (Unterbruch), aber beim Zurückkehren ist kein Moment der erzählten Zeit vergangen." Der Unterbruch war nur ein redaktioneller Schnitt, kein erzählter Zeitsprung.$LANG$,
  quellen = $QUELLEN$'Continuous' in Screenplays — MasterClass | https://www.masterclass.com/articles/continuous-screenplay
CONT'D vs. CONTINUOUS — John August | https://johnaugust.com/2010/contd-vs-continuous
When to use 'Continuous' in a Script — No Film School | https://nofilmschool.com/when-to-use-continuous-in-a-script
Scene Headings: SAME does not equal CONTINUOUS | https://scriptwrecked.com/2022/06/10/scene-headings-same-does-not-equal-continuous/$QUELLEN$
WHERE kuerzel = 'CA' AND name = 'Continuous Action';

-- ── 3. CA propagieren in Produktionskopien (nur wenn erklaerung_lang noch leer) ──
UPDATE dk_glossar g
SET
  erklaerung_lang = d.erklaerung_lang,
  quellen         = d.quellen
FROM dk_glossar_defaults d
WHERE g.kuerzel = 'CA'
  AND g.name    = 'Continuous Action'
  AND (g.erklaerung_lang IS NULL OR g.erklaerung_lang = '')
  AND d.kuerzel = 'CA'
  AND d.name    = 'Continuous Action';
