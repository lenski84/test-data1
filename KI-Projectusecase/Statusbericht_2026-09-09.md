# Prüfstand-Statusbericht

**Datenstand:** 09.09.2026 · 5 Aufgaben · 3 Kostenstellen · 2 Statusmeldungen

> Methodik-Hinweis: `pipeline.md`/`dirigenten.md` wurden im Repository nicht
> gefunden; dieser Bericht folgt einer rekonstruierten Standard-Pipeline für
> KI-gestützte Projektsteuerung. Details siehe [`README.md`](./README.md).

## Überblick

| KPI | Wert |
|---|---|
| Gesamtstatus | 🔴 Rot (Worst-of — M3 blockiert) |
| Aufgaben im Soll | 3 / 5 |
| Budget gesamt (kumuliert) | 94.700 € / 160.000 € (59,2 %) |
| Terminrisiko M3 | +6–12 Tage (neue Lieferzusage KW38 statt geplant 08.09.) |

## Meilensteine

### M1 · Konzept — 🟢 Grün (KST-4711)

Budget: 48.500 € / 50.000 € (**97,0 %**, −1.500 € ggü. Plan) · 38 Std./Wo.

| Task-ID | Titel | Owner | Geplant | Ist | Abweichung |
|---|---|---|---|---|---|
| T-101 | Prüfstand-Aufbau | Müller | 20.08.2026 | 19.08.2026 | 1 Tag früher |
| T-102 | Lastenheft finalisieren | Schmidt | 22.08.2026 | 22.08.2026 | Pünktlich |

Beide Aufgaben termingerecht bzw. früher abgeschlossen, Budget unter Plan. Meilenstein erledigt.
*Quelle: Projektplan-Export, Kostenstellenübersicht.*

### M2 · Beschaffung — 🟡 Gelb (KST-4712)

Budget: 31.200 € / 30.000 € (**104,0 %**, +1.200 € ggü. Plan, laut Statusmail weiter steigend) · 22 Std./Wo.

| Task-ID | Titel | Owner | Geplant | Status | Abweichung |
|---|---|---|---|---|---|
| T-103 | Lieferantenanfrage versenden | Yilmaz | 05.09.2026 | in Arbeit | 4 Tage nach Plan, noch offen |
| T-104 | Angebote vergleichen | Yilmaz | 12.09.2026 | offen | Noch 3 Tage, im Soll |

2 von 3 Angeboten liegen vor, drittes erwartet Anfang KW38. Budgetrahmen bereits leicht
überschritten und voraussichtlich weiter steigend (höhere Werkzeugkosten eines Lieferanten).
*Quelle: Statusmail Yilmaz, 09.09.2026.*

### M3 · Aufbau — 🔴 Rot (KST-4713)

Budget: 15.000 € / 80.000 € (**18,8 %**) · 40 Std./Wo. — geringer Mittelabfluss, weil der
Testaufbau blockiert ist (kein Einsparerfolg, sondern Stillstand).

| Task-ID | Titel | Owner | Geplant | Status | Priorität |
|---|---|---|---|---|---|
| T-105 | Testaufbau Mechanik | Fischer | 08.09.2026 | **blockiert** | hoch |

Blockiert durch ausstehende Aluprofil-Lieferung. Lieferant sagt KW38 (14.–20.09.2026) zu —
das Team erwartet dadurch rund eine Woche Verzug für M3; rechnerisch ergeben sich 6–12 Tage
gegenüber dem Plantermin.
*Quelle: Statusmeeting, Protokoll Fischer, 08.09.2026.*

## Risikoregister

| Schwere | Risiko | Beschreibung | Quelle / Mitigation |
|---|---|---|---|
| 🟠 Ernst | Lieferverzug Aluprofil blockiert T-105 (Termin · M3) | Aluprofil nicht geliefert, neue Zusage KW38, ~1 Woche Verzug erwartet, hohe Priorität betroffen | Statusmeeting Fischer, 08.09.2026 · Liefertermin nachhalten, Alternative prüfen |
| 🟡 Warnung | Budgetüberschreitung Werkzeugkosten M2 (Budget · M2) | KST-4712 bereits +4,0 % über Plan, drittes Angebot steht aus, weitere Verschärfung wahrscheinlich | Statusmail Yilmaz, 09.09.2026 · Werkzeugkosten verhandeln, Controlling informieren |
| 🟡 Warnung | Ressourcenbindung trotz Blockade in M3 (Ressourcen · M3, **abgeleitet**) | 40 Std./Wo. auf KST-4713 gebucht trotz blockiertem Task und nur 18,8 % Mittelabfluss | Eigene Ableitung aus Kostenstellen-Daten · Stundenverwendung prüfen |

## Empfehlungen

1. Liefertermin KW38 für das Aluprofil aktiv nachhalten; angesichts der hohen Priorität von
   T-105 eine Express- oder Alternativbeschaffung prüfen.
2. Nach Eingang des dritten Angebots (erwartet Anfang KW38) die Werkzeugkosten verhandeln und
   die Budgetabweichung bei KST-4712 gegenüber Controlling transparent machen.
3. Verwendung der 40 Std./Woche auf KST-4713 prüfen, solange T-105 blockiert ist.
4. Ist-Datum und Abschlussstatus von T-103 unmittelbar nach Versand nachtragen.

## Methodik & Quellen

**Ampel-Regel (offengelegt):** Grün = alle Aufgaben im Soll, Budget ≤ Plan. Gelb = Terminverzug
oder Budgetüberschreitung erkennbar, aber keine blockierte Aufgabe mit hoher Priorität. Rot =
mindestens eine blockierte Aufgabe mit hoher Priorität. Gesamtstatus = schlechtester
Einzelstatus der drei Meilensteine (Worst-of).

Quellen: Projektplan-Tabelle (T-101…T-105) · Kostenstellenübersicht (KST-4711…KST-4713) ·
Statusmeeting-Protokoll Fischer (08.09.2026) · Statusmail Yilmaz (09.09.2026).

---

Interaktives Dashboard: https://claude.ai/artifact/WEUL8xSTQm1YaNVNbXNR5w
