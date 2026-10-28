# KI.Projectusecase — KI-gestützte Projektsteuerung

Use Case für einen "dirigierenden Agenten", der eingehende Projektdaten
(Aufgabenplan, Kostenstellen, Statusmeldungen) zu einem konsolidierten
Statusbericht verarbeitet.

## Hinweis zu dieser Ausführung

Der Auftrag verwies auf `pipeline.md` und `dirigenten.md` als Spezifikation
für die Pipeline bzw. die Rolle des Dirigenten-Agenten. Beide Dateien wurden
zum Zeitpunkt der Ausführung (09.09.2026 Datenstand, Ausführung Herbst 2026)
**nicht im Repository gefunden** — weder auf diesem Branch noch auf einem der
anderen Branches, über die gesamte Historie geprüft. Ein früherer Commit
("Remove Projektarbeit_2 from repo, keep it local-only") deutet darauf hin,
dass zugehörige Projektarbeits-Unterlagen bewusst nur lokal gehalten wurden.

Um den Auftrag trotzdem zu erfüllen, wurde eine **Standard-Pipeline für
KI-gestützte Projektsteuerung** angewendet (sechsstufig):

1. **Dateneingang** — Aufgabenplan, Kostenstellenübersicht, Freitext-Statusmeldungen
2. **Konsolidierung** — Aufgaben je Meilenstein mit Kostenstelle verknüpft
3. **Abweichungsanalyse** — Termin- und Budget-Soll/Ist je Meilenstein
4. **Risikointegration** — Freitext-Reports in strukturierte Risiken übersetzt
5. **Ampel-Bewertung** — nach offengelegter Regel (siehe Statusbericht)
6. **Reporting** — konsolidierter Statusbericht

Sollten `pipeline.md`/`dirigenten.md` tatsächlich existieren (z. B. lokal
oder in einem anderen System), sollte dieser Ordner durch die Original-Spezifikation
ersetzt bzw. ergänzt werden — die Schritte oben sind eine nach bestem Wissen
rekonstruierte Annäherung, kein Ersatz für das Original.

## Inhalt

- [`Statusbericht_2026-09-09.md`](./Statusbericht_2026-09-09.md) — konsolidierter
  Statusbericht (Meilensteine, Budget, Risiken, Empfehlungen) auf Basis der
  Daten vom 09.09.2026.
