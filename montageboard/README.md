# Digitales Montageboard SMB – Prototyp

Touchfähiges Montageboard für den Sondermaschinenbau. Es ersetzt die Magnettafel:
Mitarbeitende werden als Bildkarten („Magnete“) per Drag & Drop Projekten zugeordnet,
Projekte werden als Flächen frei auf einem maßstäblichen Hallenplan platziert.

* reines **HTML, CSS und Vanilla JavaScript (ES2020)**, kein Build, kein Server, keine Bibliotheken
* Start: **Doppelklick auf `index.html`** (Microsoft Edge/Chrome, `file://`)
* läuft vollständig **offline**, keine externen Ressourcen
* Basisauflösung 1920 × 1080, skaliert exakt auf 3840 × 2160 (1 rem = 16 px bzw. 32 px)

---

## Bedienung

| Was | Wie |
|---|---|
| Person einem Projekt zuordnen | Karte ziehen (Touch: kurz halten oder 8 px bewegen) und auf eine Projektfläche oder einen Projekteintrag rechts ablegen |
| Person zum Kunden (Service) schicken | Karte auf ein Projekt unter **„Beim Kunden“** ziehen → Status *Service* |
| Person abwesend melden | Karte in der **eigenen Abteilung** in die Spalte **Abwesend** ziehen |
| Person ohne Projekt, anwesend | Karte in der eigenen Abteilung in die Spalte **Anwesend** ziehen |
| Details, Status, Foto, Vorarbeiter | Karte **antippen** → Popover |
| Zuordnen ohne Ziehen | Popover → **Zuordnen …** → Ziel antippen (Esc bricht ab) |
| Fläche aufziehen | **Fläche aufziehen** (oder `R`) → Rechteck von Ecke zu Ecke ziehen → Dialog „Projekt platzieren“ |
| Fläche verschieben | Fläche antippen (auswählen) → an der **grünen Kopfzeile** ziehen |
| Fläche vergrößern/verkleinern | ausgewählte Fläche an einem der **vier Eckgriffe** ziehen |
| Projekt wechseln / aus Plan nehmen | Kontextleiste über der ausgewählten Fläche |
| Fläche eines Projekts finden | Projekteintrag rechts antippen → Fläche pulsiert 2 s |
| Betroffene Elemente zeigen | Kennzahl-Chip in der Statusleiste antippen |
| Kalenderwoche | `‹` / `›` in der Kopfzeile oder Pfeiltasten, **Heute** springt zurück |
| Daten sichern/teilen | Menü `⋮` → Exportieren, Importieren, Mit Datei verbinden, Zurücksetzen |
| Vollbild (Kiosk) | Doppeltipp auf „SCHAEFFLER“ |

**Tastenkürzel:** `R` Fläche aufziehen · `V`/`Esc` Auswählen · `Entf` ausgewählte Fläche aus Plan · `←`/`→` KW wechseln · `Strg+Z` rückgängig

Nach **10 Minuten ohne Bedienung** springt das Board auf die aktuelle KW und den Modus „Auswählen“ zurück, offene Dialoge werden geschlossen.

---

## Architektur

```
Bedienung (Pointer Events, Klicks, Tasten)
      │
      ▼
 dnd.js / hallmap.js / app.js / render.js (Popover)
      │  rufen nur Aktionen auf, ändern nie selbst Daten
      ▼
 state.js  ── aenderung(): Undo-Eintrag → Mutation → speichern() ──►  localStorage
      │                                               └─► (optional) verbundene JSON-Datei
      ▼
 render.alles()  → Kopfzeile, Personal, Projekte, Statusleiste, Hallenplan
```

* **Keine ES-Module** (unter `file://` gesperrt). Alle Skripte werden als klassische
  `<script src>` in fester Reihenfolge geladen und hängen sich an ein globales Objekt
  `window.Board` (`Board.util`, `Board.state`, `Board.render`, `Board.hall`, `Board.dnd`, `Board.app`).
* **Einweg-Datenfluss:** Nur `state.js` verändert Daten. Jede Änderung legt einen
  Undo-Eintrag an (max. 30), speichert und zeichnet neu.
* **Hallenplan:** Der Grundriss ist ein maßstäbliches SVG (`viewBox` in Metern). Die
  Projektflächen liegen als HTML-Ebene darüber, positioniert in Prozent der Hallenmaße –
  also ebenfalls maßstäblich. HTML wurde für die Flächen gewählt, weil Textumbruch,
  Kürzung und die (ziehbaren) Personenkarten so sauber und touchfähig bleiben; die
  Ablageziele werden über `data-drop`-Attribute erkannt.
* **Drag & Drop:** ausschließlich Pointer Events (`pointerdown/move/up/cancel`,
  `setPointerCapture`), kein HTML5-Drag-and-Drop. Ziel-Ermittlung mit
  `document.elementFromPoint` + `[data-drop]`.

### Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Gerüst, lädt CSS und Skripte in Reihenfolge |
| `style.css` | Design-Tokens, Layout, Komponenten |
| `js/data.js` | Startdaten (Seed) und `SCHEMA_VERSION` |
| `js/util.js` | ISO-KW-Funktionen, Initialen, Formatierung, Icons, Toasts, Snackbar, Dialoge |
| `js/state.js` | Zustand, Ableitungsregeln, Aktionen, Undo, Speichern, Export/Import, Dateiverbindung |
| `js/render.js` | Kopfzeile, Personal, Projekte, Statusleiste, Personen-Popover |
| `js/hallmap.js` | Hallenplan: Darstellung, Fläche aufziehen/verschieben/skalieren, Dialog „Projekt platzieren“ |
| `js/dnd.js` | Ziehen der Personenkarten (Pointer Events), „Zuordnen …“ |
| `js/app.js` | Start, Verdrahtung, Menüs, Formular „+ Projekt“, Tastenkürzel, Kiosk-Hilfen |

---

## Datenmodell

```js
{
  schemaVersion: 1,
  halle: { breiteM: 60, tiefeM: 40,
           bereiche: [{ id, name, x, y, b, t }],     // Hintergrundflächen, fest
           hauptgang: { y, t, label },
           tore: [{ name, x, y }] },
  abteilungen: [{ id, kuerzel, funktion }],          // "Montage" | "Inbetriebnahme"
  projekte: [{ id, nummer, name, kunde, unterzeile,
               art,                                   // "Extern" | "Intern" | "Service"
               startKW, endKW,                        // JJJJWW, z. B. 202647
               status, statusText,                    // "Im Plan" | "Verzug" | "Prognose" | "Abgeschlossen"
               soll, abteilungId, icon,
               flaeche }],                            // null = nicht im Plan, sonst { x, y, b, t } in m
  personen: [{ id, name, personalnr, abteilungId,
               projektId,                             // null = nicht zugeteilt
               anwesenheit,                           // "Anwesend" | "Abwesend" | "Service" | "Dienstreise" | "Schulung"
               vorarbeiter, foto, fotoFreigabe }],
  freieFlaechen: [{ id, x, y, b, t }]                 // Ergänzung: aufgezogene Flächen ohne Projekt
}
```

`freieFlaechen` ist eine Ergänzung zum vorgegebenen Modell: Sie speichert Flächen, die
im Dialog „Projekt platzieren“ mit **„Als freie Fläche behalten“** bestätigt wurden.

### Ableitungsregeln (`state.js`)

* **Wo liegt eine Karte?** Jede Person liegt an genau einer Stelle:
  `projektId` gesetzt → auf dem Projekt (Fläche, Service-Eintrag oder – bei Projekt ohne
  Fläche – beim Listeneintrag); sonst in der eigenen Abteilung, Spalte **Anwesend**
  (bei `anwesenheit = "Anwesend"`) bzw. **Abwesend**.
* **Ist-Besetzung** = Anzahl Personen mit dieser `projektId`; Badge grün (Ist = Soll),
  rot (Ist < Soll), orange (Ist > Soll).
* **Projekt läuft in KW**, wenn `startKW ≤ KW ≤ endKW` (Zahlenvergleich JJJJWW,
  jahresübergreifend korrekt). Nicht laufende Projekte sind im Plan ausgegraut und rechts
  unter „Weitere Projekte“ eingeklappt.
* **Kennzahlen:** Anwesend = Anwesend + Service · Ohne Projekt = anwesend ohne Projekt ·
  Unterbesetzt = laufende Projekte mit Ist < Soll · Nicht im Plan = laufende
  Nicht-Service-Projekte ohne Fläche · Rote Ampel = laufende Projekte mit Status „Verzug“.

### Ablagelogik

| Ziel | projektId | anwesenheit |
|---|---|---|
| Externes/internes Projekt (Fläche oder Eintrag) | Zielprojekt | Anwesend |
| Service-Projekt („Beim Kunden“) | Zielprojekt | Service |
| Eigene Abteilung → Anwesend | null | Anwesend |
| Eigene Abteilung → Abwesend | null | Abwesend (Dienstreise/Schulung bleiben erhalten) |
| Fremde Abteilung | – | abgelehnt, Karte federt zurück, Hinweis |

Im Popover gilt: *Abwesend/Dienstreise/Schulung* nehmen die Person aus ihrem Projekt;
*Service* verlangt die Wahl eines laufenden Service-Projekts.

---

## Speichern

1. **Automatisch im Browser** (`localStorage`, Schlüssel `montageboard.v1`, mit
   `schemaVersion`). Fehlt der Inhalt oder ist er defekt, werden die Startdaten geladen.
2. **Export/Import** über das Menü: kompletter Stand als `montageboard-JJJJ-MM-TT.json`;
   beim Import Prüfung und Vorschau („9 Projekte, 35 Personen – übernehmen?“).
3. **Mit Datei verbinden** (nur sichtbar, wenn der Browser `showSaveFilePicker` anbietet):
   neue Datei anlegen oder vorhandene öffnen (z. B. im OneDrive-/Teams-Ordner). Jede
   Änderung wird nach 1 s in die Datei geschrieben, alle 30 s wird geprüft, ob die Datei
   extern geändert wurde (dann Neuladen und Hinweis „Stand aktualisiert“). Der Dateihandle
   liegt in IndexedDB; nach einem Neustart erscheint „Verbindung wiederherstellen“ (Menü
   oder Klick auf den Sync-Punkt), weil der Browser die Berechtigung nur nach einem Klick
   erneut erteilt. Bei Fehlern fällt das Board auf `localStorage` zurück.
4. **Sync-Punkt** in der Kopfzeile: grün = gespeichert, gelb = speichert / wartet, rot = Fehler.

---

## Abnahme – Testfälle und Ergebnis

Automatisiert geprüft mit Chromium (Playwright) über `file://`, 1920 × 1080; Fall 11
zusätzlich mit echten Touch-Ereignissen (Chrome DevTools Protocol) bei 1920 × 1080 und
3840 × 2160.

| # | Testfall | Ergebnis |
|---|---|---|
| 1 | `index.html` per `file://` öffnen | ✅ vollständig, 0 Konsolenfehler, 0 Netzwerkanfragen |
| 2 | Lennart Kleemann von „Lucid Prüfstand“ auf „SEW Linie 3“ ziehen | ✅ Ist Lucid 4→3, SEW 3→4, Statusleiste aktualisiert |
| 3 | Thor Odinson auf „Kunde A Vor-Ort“ ziehen | ✅ Status Service (blauer Punkt), Karte unter „Beim Kunden“ |
| 4 | Hulk in SZA3 → Abwesend ziehen | ✅ Projekt leer, Status Abwesend, roter Punkt |
| 5 | Hulk in SZA1 → Anwesend ziehen | ✅ abgelehnt, federt zurück, Hinweis |
| 6 | 12 × 10 m aufziehen → „Wafer-Handling“ platzieren | ✅ Fläche mit Projekt, „Nicht im Plan“ 2→1 |
| 7 | Fläche über Kopfzeile verschieben, an Ecke vergrößern | ✅ Maße im 0,5-m-Raster, Überschneidung rot markiert |
| 8 | Strg+Z | ✅ letzte Änderung zurückgenommen |
| 9 | Seite neu laden | ✅ Stand exakt identisch |
| 10 | KW 202652 → weiterblättern | ✅ KW 52 (21.12.–27.12.2026) → **KW 53** (28.12.–03.01.2027) → KW 1 (04.01.–10.01.2027); laufende Projekte außerhalb ausgegraut |
| 11 | Touch bei 1920 × 1080 und 3840 × 2160 | ✅ Ziehen, Antippen (Popover) und Aufziehen funktionieren, kein Überlauf |
| 12 | Export → Startdaten → Import | ✅ alter Stand wieder da |

Hinweis zu Fall 10: 2026 hat nach ISO 8601 **53 Kalenderwochen** (das Jahr beginnt an
einem Donnerstag). Zwischen 202652 und 202701 liegt deshalb korrekt die KW 202653.

---

## Bekannte Grenzen

* **Dateiverbindung:** Die API ist in Edge/Chrome unter `file://` verfügbar; die
  Dateiauswahl selbst (System-Dialog) ließ sich nicht automatisiert testen. Bei
  gleichzeitiger Bearbeitung an zwei Geräten gewinnt die zuletzt gespeicherte Änderung
  (kein Zusammenführen, keine Sperre).
* **`localStorage` gilt je Browserprofil und Dateipfad.** Wird `index.html` an einen
  anderen Ort kopiert, beginnt das Board mit den Startdaten – dann über Export/Import oder
  die Dateiverbindung übertragen.
* **Fotos** werden als verkleinerte dataURL (256 px) im Datenstand gespeichert; viele Fotos
  vergrößern Export-Datei und `localStorage` (Grenze ca. 5 MB).
* Tabs Forecast, Maßnahmen, Auswertung, Stammdaten sowie die Tagesansicht sind Platzhalter.
* Keine Benutzerverwaltung; Rolle „Meister“ ist fest.
