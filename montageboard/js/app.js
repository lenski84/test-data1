/* =============================================================================
   app.js – Start, Verdrahtung der Bedienelemente, Tastenkürzel, Kiosk-Hilfen
   ============================================================================= */
window.Board = window.Board || {};

Board.app = (function () {
  "use strict";
  const U = Board.util, S = Board.state, R = Board.render;
  const $ = function (id) { return document.getElementById(id); };
  const INAKTIV_MS = 10 * 60 * 1000;
  let inaktivTimer = null, hlTimer = null, pulsTimer = null, letzterLogoKlick = 0;

  /** Einstiegspunkt nach dem Laden der Seite. */
  function start() {
    S.laden();
    R.alles();
    Board.hall.init();
    Board.dnd.init();
    verdrahten();
    uhr(); setInterval(uhr, 10000);
    inaktivitaetZuruecksetzen();
    S.dateiBeimStart();
  }

  /** Uhrzeit hh:mm in der Kopfzeile. */
  function uhr() {
    const d = new Date();
    $("uhr").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  /* ===========================================================================
     Ereignisse
     ========================================================================= */
  function verdrahten() {
    // KW-Navigation
    $("btnKwZurueck").addEventListener("click", function () { kwWechseln(-1); });
    $("btnKwVor").addEventListener("click", function () { kwWechseln(1); });
    $("btnHeute").addEventListener("click", function () { S.ui.kw = U.aktuelleKw(); S.ui.auswahl = null; R.alles(); });
    // Tag | Woche (nur optisch)
    $("segAnsicht").addEventListener("click", function (e) {
      if (e.target.closest("[data-ansicht='tag']")) U.toast("Tagesansicht folgt in einer späteren Ausbaustufe", "info");
    });
    // Tabs
    document.addEventListener("click", function (e) {
      const t = e.target.closest("[data-tab]"); if (!t) return;
      S.ui.tab = t.dataset.tab; R.popoverSchliessen(); R.alles();
    });
    // Hallenplan-Werkzeuge
    $("modus").addEventListener("click", function (e) { const b = e.target.closest("[data-modus]"); if (b) Board.hall.modusSetzen(b.dataset.modus); });
    $("btnRaster").addEventListener("click", Board.hall.rasterUmschalten);
    $("btnLeeren").addEventListener("click", Board.hall.leeren);
    // Projekte
    $("btnNeuesProjekt").addEventListener("click", projektFormular);
    $("projekte").addEventListener("click", eintragKlick);
    // Statusleiste
    $("statusleiste").addEventListener("click", function (e) { const c = e.target.closest("[data-kpi]"); if (c) hervorheben(c.dataset.kpi); });
    // Popover
    $("popover").addEventListener("click", R.popoverKlick);
    $("popover").addEventListener("change", R.popoverAenderung);
    document.addEventListener("pointerdown", function (e) {
      if (R.popoverOffen() && !e.target.closest("#popover") && !e.target.closest("[data-person]")) R.popoverSchliessen();
      if (!e.target.closest(".dropdown") && !e.target.closest("[data-dropdown]")) dropdownZu();
    });
    // Kopfzeile: Glocke, Filter, Menü, Sync
    $("btnGlocke").addEventListener("click", glocke);
    $("btnFilter").addEventListener("click", filter);
    $("btnMenue").addEventListener("click", menue);
    $("syncPunkt").addEventListener("click", function () { if (S.datei.wartetAufErlaubnis) S.dateiWiederherstellen(); else U.toast(S.ui.syncText, "info"); });
    $("importDatei").addEventListener("change", function (e) { if (e.target.files[0]) S.importieren(e.target.files[0]); e.target.value = ""; });
    // Tastatur
    document.addEventListener("keydown", taste);
    // Kiosk: Doppeltipp auf Logo → Vollbild; Kontextmenü & Pinch-Zoom aus
    $("logo").addEventListener("click", function () {
      const jetzt = Date.now();
      if (jetzt - letzterLogoKlick < 400) vollbild();
      letzterLogoKlick = jetzt;
    });
    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.addEventListener("wheel", function (e) { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    ["gesturestart", "gesturechange"].forEach(function (n) { document.addEventListener(n, function (e) { e.preventDefault(); }); });
    // Inaktivität
    ["pointerdown", "keydown"].forEach(function (n) { document.addEventListener(n, inaktivitaetZuruecksetzen, true); });
  }

  /** KW um delta Wochen wechseln. */
  function kwWechseln(delta) {
    S.ui.kw = U.kwVerschieben(S.ui.kw, delta);
    S.ui.auswahl = null;
    R.alles();
  }

  /** Antippen eines Projekt-Eintrags: zugehörige Fläche pulsiert 2 s. */
  function eintragKlick(e) {
    if (e.target.closest("[data-person]")) return;
    const ein = e.target.closest("[data-eintrag]"); if (!ein) return;
    const pr = S.projekt(ein.dataset.eintrag);
    S.ui.puls = pr.id;
    if (pr.flaeche && pr.art !== "Service") S.ui.auswahl = { art: "p", id: pr.id };
    R.alles();
    clearTimeout(pulsTimer);
    pulsTimer = setTimeout(function () { S.ui.puls = null; R.alles(); }, 2000);
  }

  /** Kennzahl-Chip: betroffene Elemente hervorheben (erneut tippen = aus). */
  function hervorheben(key) {
    S.ui.hervorheben = S.ui.hervorheben === key ? null : key;
    R.alles();
    clearTimeout(hlTimer);
    if (S.ui.hervorheben) hlTimer = setTimeout(function () { S.ui.hervorheben = null; R.alles(); }, 8000);
  }

  /* ===========================================================================
     Dropdowns (Glocke, Filter, Menü)
     ========================================================================= */

  /** Öffnet ein Dropdown unter einem Kopfzeilen-Knopf. */
  function dropdown(knopf, html) {
    dropdownZu();
    const r = knopf.getBoundingClientRect();
    const d = U.el('<div class="dropdown">' + html + "</div>");
    document.body.appendChild(d);
    d.style.top = (r.bottom + 6) + "px";
    d.style.left = Math.max(8, Math.min(innerWidth - d.offsetWidth - 8, r.right - d.offsetWidth)) + "px";
    return d;
  }
  function dropdownZu() { document.querySelectorAll(".dropdown").forEach(function (d) { d.remove(); }); }

  /** Glocke: letzte Meldungen. */
  function glocke() {
    const m = S.ui.meldungen;
    S.ui.ungelesen = 0; R.kopf();
    dropdown($("btnGlocke"), '<div class="dd-kopf">Meldungen</div>' +
      (m.length ? m.map(function (x) { return '<div class="dd-meldung ' + x.art + '"><span>' + x.zeit + "</span>" + U.esc(x.text) + "</div>"; }).join("")
                : '<div class="dd-leer">Noch keine Meldungen in dieser Sitzung.</div>'));
  }

  /** Filter: Abteilung hervorheben (andere werden gedimmt). */
  function filter() {
    const d = dropdown($("btnFilter"), '<div class="dd-kopf">Abteilung filtern</div>' +
      '<button type="button" class="dd-item' + (!S.ui.filterAbt ? " aktiv" : "") + '" data-abt="">Alle Abteilungen</button>' +
      S.daten().abteilungen.map(function (a) {
        return '<button type="button" class="dd-item' + (S.ui.filterAbt === a.id ? " aktiv" : "") + '" data-abt="' + a.id + '">' + U.esc(a.kuerzel) + " <small>" + U.esc(a.funktion) + "</small></button>";
      }).join(""));
    d.addEventListener("click", function (e) {
      const b = e.target.closest("[data-abt]"); if (!b) return;
      S.ui.filterAbt = b.dataset.abt || null; dropdownZu(); R.alles();
    });
  }

  /** Menü ⋮: Export, Import, Dateiverbindung, Zurücksetzen. */
  function menue() {
    const dt = S.datei;
    let dateiPunkte = "";
    if (dt.verfuegbar) {
      if (dt.aktiv) dateiPunkte = '<button type="button" class="dd-item" data-m="trennen">' + U.icon("link") + "Dateiverbindung trennen<small>" + U.esc(dt.handle ? dt.handle.name : "") + "</small></button>";
      else if (dt.wartetAufErlaubnis) dateiPunkte = '<button type="button" class="dd-item" data-m="wieder">' + U.icon("link") + "Verbindung wiederherstellen</button>";
      else dateiPunkte = '<button type="button" class="dd-item" data-m="verbinden">' + U.icon("link") + "Mit Datei verbinden</button>";
    }
    const d = dropdown($("btnMenue"),
      '<button type="button" class="dd-item" data-m="export">' + U.icon("download") + "Daten exportieren</button>" +
      '<button type="button" class="dd-item" data-m="import">' + U.icon("upload") + "Daten importieren</button>" +
      dateiPunkte +
      '<div class="dd-trenn"></div><button type="button" class="dd-item gefahr" data-m="reset">' + U.icon("reset") + "Auf Startdaten zurücksetzen</button>");
    d.addEventListener("click", function (e) {
      const b = e.target.closest("[data-m]"); if (!b) return;
      dropdownZu();
      const m = b.dataset.m;
      if (m === "export") S.exportieren();
      else if (m === "import") $("importDatei").click();
      else if (m === "verbinden") dateiVerbinden();
      else if (m === "wieder") S.dateiWiederherstellen();
      else if (m === "trennen") S.dateiTrennen();
      else if (m === "reset") U.bestaetigen("Auf Startdaten zurücksetzen", "Der aktuelle Stand wird durch die Startdaten ersetzt. Rückgängig ist möglich.", "Zurücksetzen")
        .then(function (ja) { if (ja) S.zuruecksetzen(); });
    });
  }

  /** Auswahl: neue Datei anlegen oder vorhandene öffnen. */
  function dateiVerbinden() {
    U.dialog({
      titel: "Mit Datei verbinden", breite: "36rem",
      inhalt: "<p class='dlg-text'>Das Board schreibt jede Änderung automatisch in die gewählte JSON-Datei (z. B. in einem OneDrive-/Teams-Ordner) und lädt sie neu, wenn sie von einem anderen Rechner geändert wurde.</p>",
      knoepfe: [
        { text: "Abbrechen" },
        { text: "Vorhandene Datei öffnen", aktion: S.dateiOeffnen },
        { text: "Neue Datei anlegen", art: "pri", aktion: S.dateiNeu }
      ]
    });
  }

  /* ===========================================================================
     Formular „+ Projekt“
     ========================================================================= */
  function projektFormular() {
    const d = S.daten();
    const kw = S.ui.kw, ende = U.kwVerschieben(kw, 6);
    const icons = ["gear", "bolt", "cell", "bearing", "laser", "chip", "school", "truck", "wrench", "box"];
    const f = U.el('<form class="formular" autocomplete="off">' +
      feld("Projektnummer", '<input name="nummer" required placeholder="P-24150">') +
      feld("Name", '<input name="name" required placeholder="z. B. Prüfzelle Getriebe">') +
      feld("Kunde", '<input name="kunde" placeholder="Kunde">') +
      feld("Unterzeile", '<input name="unterzeile" placeholder="z. B. Endmontage">') +
      feld("Art", '<select name="art"><option>Extern</option><option>Intern</option><option>Service</option></select>') +
      feld("Abteilung", '<select name="abteilungId">' + d.abteilungen.map(function (a) { return '<option value="' + a.id + '">' + U.esc(a.kuerzel) + "</option>"; }).join("") + "</select>") +
      feld("Start-KW (JJJJWW)", '<input name="startKW" inputmode="numeric" value="' + kw + '">') +
      feld("End-KW (JJJJWW)", '<input name="endKW" inputmode="numeric" value="' + ende + '">') +
      feld("Soll-Besetzung", '<input name="soll" type="number" min="1" max="30" value="4">') +
      feld("Status", '<select name="status"><option>Im Plan</option><option>Prognose</option><option>Verzug</option><option>Abgeschlossen</option></select>') +
      feld("Statustext", '<input name="statusText" placeholder="z. B. +2 AT">') +
      feld("Icon", '<div class="icon-wahl">' + icons.map(function (i, n) { return '<label><input type="radio" name="icon" value="' + i + '"' + (n ? "" : " checked") + ">" + U.icon(i) + "</label>"; }).join("") + "</div>", true) +
      '<p class="fehler" hidden></p></form>');
    function feld(l, inp, breit) { return '<label class="feld' + (breit ? " breit" : "") + '"><span>' + l + "</span>" + inp + "</label>"; }
    const dlg = U.dialog({
      titel: "Neues Projekt", untertitel: "Das Projekt erscheint danach als „nicht im Plan“.", inhalt: f, breite: "44rem",
      knoepfe: [{ text: "Abbrechen" }, { text: "Anlegen", art: "pri", bleibt: true, aktion: anlegen }]
    });
    function anlegen() {
      const v = Object.fromEntries(new FormData(f).entries());
      const fehler = [];
      const kwOk = function (k) { const n = +k; return /^\d{6}$/.test(k) && n % 100 >= 1 && n % 100 <= 53; };
      if (!v.nummer.trim()) fehler.push("Projektnummer fehlt");
      if (!v.name.trim()) fehler.push("Name fehlt");
      if (!kwOk(v.startKW) || !kwOk(v.endKW)) fehler.push("KW im Format JJJJWW angeben (z. B. 202647)");
      else if (+v.startKW > +v.endKW) fehler.push("Start-KW liegt nach End-KW");
      if (d.projekte.some(function (p) { return p.nummer === v.nummer.trim(); })) fehler.push("Projektnummer existiert bereits");
      const fe = f.querySelector(".fehler");
      if (fehler.length) { fe.textContent = fehler.join(" · "); fe.hidden = false; return; }
      S.projektAnlegen({
        id: "pr" + Date.now().toString(36), nummer: v.nummer.trim(), name: v.name.trim(), kunde: v.kunde.trim(),
        unterzeile: v.unterzeile.trim(), art: v.art, startKW: +v.startKW, endKW: +v.endKW, status: v.status,
        statusText: v.statusText.trim(), soll: Math.max(1, +v.soll || 1), abteilungId: v.abteilungId, icon: v.icon || "box", flaeche: null
      });
      dlg.schliessen(false);
    }
  }

  /* ===========================================================================
     Tastatur, Vollbild, Inaktivität
     ========================================================================= */
  function taste(e) {
    const imFeld = /INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { if (!imFeld) { e.preventDefault(); S.rueckgaengig(); } return; }
    if (e.key === "Escape") {
      if (document.querySelector(".dlg-bg")) return;   // Dialog: X/Hintergrund benutzen
      R.popoverSchliessen(); dropdownZu(); Board.dnd.zuordnenAbbrechen();
      Board.hall.modusSetzen("auswahl"); S.ui.auswahl = null; R.alles(); return;
    }
    if (imFeld || document.querySelector(".dlg-bg") || S.ui.tab !== "board") return;
    const k = e.key.toLowerCase();
    if (k === "r") Board.hall.modusSetzen("aufziehen");
    else if (k === "v") Board.hall.modusSetzen("auswahl");
    else if (e.key === "Delete" || e.key === "Entf") Board.hall.auswahlEntfernen();
    else if (e.key === "ArrowLeft") kwWechseln(-1);
    else if (e.key === "ArrowRight") kwWechseln(1);
  }

  /** Vollbild umschalten (muss direkt aus einem Klick kommen). */
  function vollbild() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else { const p = document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(function () { U.toast("Vollbild nicht möglich", "warn"); }); }
    } catch (e) { U.toast("Vollbild nicht möglich", "warn"); }
  }

  /** Nach 10 min ohne Bedienung: aktuelle KW, Modus „Auswählen“, alles zu. */
  function inaktivitaetZuruecksetzen() {
    clearTimeout(inaktivTimer);
    inaktivTimer = setTimeout(function () {
      S.ui.kw = U.aktuelleKw(); S.ui.modus = "auswahl"; S.ui.auswahl = null; S.ui.hervorheben = null;
      S.ui.filterAbt = null; S.ui.zuordnen = null; S.ui.tab = "board";
      R.popoverSchliessen(); dropdownZu(); U.alleDialogeSchliessen(); R.alles();
    }, INAKTIV_MS);
  }

  return { start: start };
})();

document.addEventListener("DOMContentLoaded", Board.app.start);
