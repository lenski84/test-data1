# Montageboard – OneDrive-Ordner-Verbindung (Weg 2)

Dieser Ordner enthält die **neuen** Dateien. Die bestehenden Dateien deiner App
(`index.html`, `js/state.js`, `js/app.js`, `js/render.js`) lagen nicht im Repo und
müssen daher noch von Hand angepasst werden (Schritte 2–5 unten).

## 1. Neue Dateien in den App-Ordner kopieren

| Datei hier im Repo | Ziel im App-Ordner |
|---|---|
| `montageboard/js/ordner.js` | `js/ordner.js` |
| `montageboard/data/stammdaten.json` | `data/stammdaten.json` (Ordner `data` neu anlegen) |

`style.css`, `data.js`, `util.js`, `hallmap.js` und `dnd.js` bleiben unverändert.

## 2. `index.html`

Direkt nach `<script src="js/state.js"></script>` einfügen:

```html
<script src="js/ordner.js"></script>
```

Reihenfolge danach: data → util → state → **ordner** → render → hallmap → dnd → app.

## 3. `js/state.js` (2 Änderungen)

**(a)** In `speichern()` diesen Block

```js
    if (datei.aktiv) datei.planen();
    else syncSetzen("ok", "Im Browser gespeichert");
  }
```

ersetzen durch

```js
    // Weg 2: Ist der OneDrive-Ordner verbunden, protokolliert und speichert ordner.js
    if (Board.ordner && Board.ordner.nachAenderung(daten)) return;
    if (datei.aktiv) datei.planen();
    else syncSetzen("ok", "Im Browser gespeichert");
  }

  /** Übernimmt einen Datenstand von außen (Ordner) OHNE Undo/Protokoll; Undo-Stapel wird geleert. */
  function datenSetzen(neu) {
    daten = neu;
    undoStapel.length = 0;
    ui.auswahl = null;
    try { localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten)); } catch (e) { /* nicht kritisch */ }
    Board.render.alles();
  }
```

**(b)** Im `return { … }` am Dateiende `laden: laden, pruefen: pruefen,` ersetzen durch

```js
    laden: laden, pruefen: pruefen, datenSetzen: datenSetzen, syncSetzen: syncSetzen,
```

## 4. `js/app.js` (4 Änderungen)

**(a)** Am Ende von `start()` die Zeile `S.dateiBeimStart();` (und die schließende `}` der Funktion) ersetzen durch

```js
    if (Board.ordner && Board.ordner.verfuegbar()) Board.ordner.beimStart();
    else S.dateiBeimStart();
  }

  /** true, wenn der OneDrive-Ordner verbunden ist (Stammdaten kommen dann aus den Listen). */
  function ordnerAktiv() { return !!(Board.ordner && Board.ordner.aktiv()); }
```

**(b)** Den Listener `$("syncPunkt").addEventListener("click", …)` ersetzen durch

```js
    $("syncPunkt").addEventListener("click", function () {
      if (Board.ordner && Board.ordner.wartet()) Board.ordner.wiederherstellen();
      else if (S.datei.wartetAufErlaubnis) S.dateiWiederherstellen();
      else U.toast(S.ui.syncText, "info");
    });
```

**(c)** Die komplette Funktion `menue()` ersetzen durch

```js
  function menue() {
    const dt = S.datei, O = Board.ordner;
    let dateiPunkte = "";
    if (O && O.verfuegbar()) {
      if (O.aktiv()) dateiPunkte = '<button type="button" class="dd-item" data-m="o-neu">' + U.icon("reset") + "Aus Ordner neu laden<small>" + U.esc(O.name()) + "</small></button>" +
                                   '<button type="button" class="dd-item" data-m="o-trennen">' + U.icon("link") + "Ordnerverbindung trennen</button>";
      else if (O.wartet()) dateiPunkte = '<button type="button" class="dd-item" data-m="o-wieder">' + U.icon("link") + "Ordnerverbindung wiederherstellen</button>";
      else dateiPunkte = '<button type="button" class="dd-item" data-m="o-verbinden">' + U.icon("link") + "Mit OneDrive-Ordner verbinden</button>";
    } else if (dt.verfuegbar) {
      if (dt.aktiv) dateiPunkte = '<button type="button" class="dd-item" data-m="trennen">' + U.icon("link") + "Dateiverbindung trennen<small>" + U.esc(dt.handle ? dt.handle.name : "") + "</small></button>";
      else if (dt.wartetAufErlaubnis) dateiPunkte = '<button type="button" class="dd-item" data-m="wieder">' + U.icon("link") + "Verbindung wiederherstellen</button>";
      else dateiPunkte = '<button type="button" class="dd-item" data-m="verbinden">' + U.icon("link") + "Mit Datei verbinden</button>";
    }
    const d = dropdown($("btnMenue"),
      '<button type="button" class="dd-item" data-m="export">' + U.icon("download") + "Daten exportieren</button>" +
      (ordnerAktiv() ? "" : '<button type="button" class="dd-item" data-m="import">' + U.icon("upload") + "Daten importieren</button>") +
      dateiPunkte +
      (ordnerAktiv() ? "" : '<div class="dd-trenn"></div><button type="button" class="dd-item gefahr" data-m="reset">' + U.icon("reset") + "Auf Startdaten zurücksetzen</button>"));
    d.addEventListener("click", function (e) {
      const b = e.target.closest("[data-m]"); if (!b) return;
      dropdownZu();
      const m = b.dataset.m;
      if (m === "o-verbinden") O.verbinden();
      else if (m === "o-wieder") O.wiederherstellen();
      else if (m === "o-trennen") O.trennen();
      else if (m === "o-neu") O.neuLaden();
      else if (m === "export") S.exportieren();
      else if (m === "import") $("importDatei").click();
      else if (m === "verbinden") dateiVerbinden();
      else if (m === "wieder") S.dateiWiederherstellen();
      else if (m === "trennen") S.dateiTrennen();
      else if (m === "reset") U.bestaetigen("Auf Startdaten zurücksetzen", "Der aktuelle Stand wird durch die Startdaten ersetzt. Rückgängig ist möglich.", "Zurücksetzen")
        .then(function (ja) { if (ja) S.zuruecksetzen(); });
    });
  }
```

**(d)** Direkt nach `function projektFormular() {` einfügen:

```js
    if (ordnerAktiv()) {
      U.toast("Neue Projekte bitte in der Liste „Projekte“ anlegen – das Board übernimmt sie automatisch", "info");
      return;
    }
```

## 5. `js/render.js` (3 Änderungen)

**(a)** In `sync()` die Zeile `$("syncText").textContent = …` ersetzen durch

```js
    const getrennt = (Board.ordner && Board.ordner.wartet()) ? "Ordner verbinden" : (S.datei.wartetAufErlaubnis ? "Datei getrennt" : null);
    $("syncText").textContent = S.ui.sync === "ok" ? "gespeichert" : S.ui.sync === "speichert" ? (getrennt || "speichert …") : "Fehler";
```

**(b)** `U.esc(pr.unterzeile) + " · " + U.esc(pr.nummer)` ersetzen durch

```js
U.esc([pr.unterzeile, pr.nummer].filter(Boolean).join(" · "))
```

**(c)** `U.esc(a.kuerzel + " · " + a.funktion + " · " + p.personalnr)` ersetzen durch

```js
U.esc(a.kuerzel + " · " + a.funktion + (p.personalnr ? " · " + p.personalnr : ""))
```

## 6. Danach

- App-Ordner nach `%OneDriveCommercial%\Montageboard` legen (falls noch nicht in OneDrive).
- `index.html` in Edge öffnen → Menü → „Mit OneDrive-Ordner verbinden“ → Ordner `data` wählen.
- Beim ersten Verbinden legt das Board `data/board-state.json` selbst an.
