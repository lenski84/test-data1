/* =============================================================================
   state.js – Zustand, Ableitungsregeln, Aktionen, Speichern, Undo
   -----------------------------------------------------------------------------
   Dies ist die EINZIGE Stelle, die den Datenstand verändert. Alle anderen
   Module lesen über Board.state.daten() und rufen Aktionen auf.
   Datenfluss:  Aktion → aenderung() (Undo-Eintrag + Mutation) → speichern()
                → Board.render.alles()
   ============================================================================= */
window.Board = window.Board || {};

Board.state = (function () {
  "use strict";
  const U = Board.util;
  const SPEICHER_SCHLUESSEL = "montageboard.v2";
  const UNDO_MAX = 30;

  /** Aktueller Datenstand (wird gespeichert). */
  let daten = null;
  /** Undo-Stapel: JSON-Abzüge vor jeder Änderung. */
  const undoStapel = [];

  /** Oberflächenzustand (wird NICHT gespeichert). */
  const ui = {
    kw: U.aktuelleKw(),       // gewählte Kalenderwoche JJJJWW
    modus: "auswahl",         // "auswahl" | "aufziehen"
    raster: true,             // Rasterfang 0,5 m an/aus
    auswahl: null,            // ausgewählte Fläche: { art:"p"|"f", id }
    hervorheben: null,        // Kennzahl-Hervorhebung: "anwesend" | "ohne" | "unter" | "plan" | "rot"
    puls: null,               // Projekt-ID, deren Fläche kurz pulsiert
    filterAbt: null,          // Abteilungsfilter (null = alle)
    tab: "board",
    sync: "ok",               // "ok" | "speichert" | "fehler"
    syncText: "Im Browser gespeichert",
    meldungen: [],            // Glocke: { zeit, text, art }
    ungelesen: 0,
    zuordnen: null            // Person-ID im Modus „Zuordnen…“ (ohne Ziehen)
  };

  /* ===========================================================================
     Laden & Validieren
     ========================================================================= */

  /**
   * Prüft, ob ein Objekt ein gültiger Datenstand ist.
   * @param {object} o
   * @returns {string|null} Fehlertext oder null wenn gültig
   */
  function pruefen(o) {
    if (!o || typeof o !== "object") return "Kein Objekt";
    if (o.schemaVersion !== Board.SCHEMA_VERSION) return "Falsche Schema-Version (" + o.schemaVersion + ")";
    if (!o.halle || !Array.isArray(o.halle.bereiche)) return "Hallendaten fehlen";
    if (!Array.isArray(o.abteilungen) || !Array.isArray(o.projekte) || !Array.isArray(o.personen)) return "Listen fehlen";
    for (const p of o.personen) if (!p.id || !p.name || !p.abteilungId) return "Person unvollständig";
    for (const p of o.projekte) if (!p.id || !p.name || !p.art) return "Projekt unvollständig";
    if (!Array.isArray(o.freieFlaechen)) o.freieFlaechen = [];
    return null;
  }

  /** Lädt den Stand aus localStorage; bei Fehlen/Fehler werden die Startdaten genutzt. */
  function laden() {
    try {
      const roh = localStorage.getItem(SPEICHER_SCHLUESSEL);
      if (roh) {
        const o = JSON.parse(roh);
        if (!pruefen(o)) { daten = o; return; }
      }
    } catch (e) { /* kaputter Inhalt → Startdaten */ }
    daten = Board.seed();
    speichern();
  }

  /* ===========================================================================
     Speichern (localStorage + optionale Dateiverbindung)
     ========================================================================= */

  /** Setzt den Sync-Indikator und zeichnet die Kopfzeile neu. */
  function syncSetzen(status, text) {
    ui.sync = status; if (text) ui.syncText = text;
    if (Board.render && Board.render.sync) Board.render.sync();
  }

  /** Speichert den Stand im Browser und – falls verbunden – entprellt in die Datei. */
  function speichern() {
    syncSetzen("speichert");
    try {
      localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten));
    } catch (e) {
      syncSetzen("fehler", "Speichern im Browser fehlgeschlagen");
      return;
    }
    if (datei.aktiv) datei.planen();
    else syncSetzen("ok", "Im Browser gespeichert");
  }

  /* ===========================================================================
     Änderungen & Undo
     ========================================================================= */

  /**
   * Führt eine Datenänderung aus: Undo-Eintrag, Mutation, Speichern, Neuzeichnen.
   * @param {string|null} text  Text für Snackbar/Meldung (null = keine Snackbar)
   * @param {Function} fn       Mutationsfunktion, erhält den Datenstand
   */
  function aenderung(text, fn) {
    undoStapel.push(JSON.stringify(daten));
    if (undoStapel.length > UNDO_MAX) undoStapel.shift();
    fn(daten);
    speichern();
    Board.render.alles();
    if (text) U.snackbar(text, "Rückgängig", rueckgaengig);
  }

  /** Macht die letzte Änderung rückgängig (Strg+Z / Snackbar). */
  function rueckgaengig() {
    const letzter = undoStapel.pop();
    if (!letzter) { U.toast("Nichts zum Rückgängigmachen", "info"); return; }
    daten = JSON.parse(letzter);
    ui.auswahl = null;
    speichern();
    Board.render.alles();
    U.toast("Rückgängig gemacht", "ok");
  }

  /** Fügt eine Meldung für die Glocke hinzu. */
  function melden(text, art) {
    const d = new Date();
    ui.meldungen.unshift({ zeit: String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"), text: text, art: art || "info" });
    ui.meldungen = ui.meldungen.slice(0, 20);
    ui.ungelesen++;
  }

  /* ===========================================================================
     Nachschlagen
     ========================================================================= */
  function person(id) { return daten.personen.find(function (p) { return p.id === id; }); }
  function projekt(id) { return daten.projekte.find(function (p) { return p.id === id; }); }
  function abteilung(id) { return daten.abteilungen.find(function (a) { return a.id === id; }); }

  /* ===========================================================================
     Ableitungsregeln
     ========================================================================= */

  /**
   * Wo wird eine Person angezeigt? Eine anwesende Person erscheint DREIMAL:
   *  1. links in ihrer Abteilung, Spalte „Anwesend“
   *  2. im Hallenplan auf der Fläche ihres Projekts (externe und interne
   *     Projekte werden direkt im Montagebereich bearbeitet)
   *  3. rechts beim externen bzw. internen Projekt
   * Service: links unter „Anwesend“ (blauer Punkt) und rechts unter „Beim
   * Kunden“ – NICHT im Hallenplan.
   * Abwesend/Dienstreise/Schulung: nur links in der Spalte „Abwesend“.
   * @param {object} p Person
   * @returns {"an"|"ab"} Spalte in der Personaltabelle
   */
  function spalte(p) {
    return (p.anwesenheit === "Anwesend" || p.anwesenheit === "Service") ? "an" : "ab";
  }

  /** Ist-Besetzung = Anzahl Personen mit dieser projektId. */
  function ist(projektId) {
    return daten.personen.filter(function (p) { return p.projektId === projektId; }).length;
  }

  /** Personen auf einem Projekt. */
  function personenAuf(projektId) {
    return daten.personen.filter(function (p) { return p.projektId === projektId; });
  }

  /**
   * Bewertung Ist/Soll: "ok" (Ist = Soll), "unter" (Ist < Soll), "ueber" (Ist > Soll).
   */
  function besetzung(pr) {
    const n = ist(pr.id);
    return { ist: n, soll: pr.soll, klasse: n === pr.soll ? "ok" : n < pr.soll ? "unter" : "ueber" };
  }

  /** Läuft das Projekt in der KW? startKW <= kw <= endKW (JJJJWW-Vergleich). */
  function laeuft(pr, kw) { return pr.startKW <= (kw || ui.kw) && (kw || ui.kw) <= pr.endKW; }

  /** Montagebereich, in dem der Mittelpunkt eines Rechtecks liegt (oder null). */
  function bereichVon(r) {
    const cx = r.x + r.b / 2, cy = r.y + r.t / 2;
    return daten.halle.bereiche.find(function (b) { return cx >= b.x && cx <= b.x + b.b && cy >= b.y && cy <= b.y + b.t; }) || null;
  }

  /** Überschneiden sich zwei Rechtecke (x, y, b, t)? Berühren zählt nicht. */
  function schneiden(a, b) {
    return a.x < b.x + b.b - 1e-6 && b.x < a.x + a.b - 1e-6 && a.y < b.y + b.t - 1e-6 && b.y < a.y + a.t - 1e-6;
  }

  /** Alle Flächen im Plan als Liste { key:"p:id"|"f:id", r }. */
  function alleFlaechen() {
    const l = [];
    daten.projekte.forEach(function (p) { if (p.flaeche && p.art !== "Service") l.push({ key: "p:" + p.id, r: p.flaeche }); });
    daten.freieFlaechen.forEach(function (f) { l.push({ key: "f:" + f.id, r: f }); });
    return l;
  }

  /**
   * Menge der Flächen-Schlüssel, die sich mit einer anderen Fläche überschneiden.
   * @param {object} [ersatz] optional { key, r } – Live-Vorschau beim Ziehen
   */
  function ueberschneidungen(ersatz) {
    const l = alleFlaechen().map(function (f) { return ersatz && f.key === ersatz.key ? ersatz : f; });
    if (ersatz && !l.some(function (f) { return f.key === ersatz.key; })) l.push(ersatz);
    const s = new Set();
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      if (schneiden(l[i].r, l[j].r)) { s.add(l[i].key); s.add(l[j].key); }
    }
    return s;
  }

  /**
   * Kennzahlen für die Statusleiste (live berechnet, bezogen auf die gewählte KW).
   * - Anwesend: Anwesend + Service (Service ist anwesend, aber beim Kunden)
   * - Ohne Projekt: anwesend und keinem Projekt zugeteilt
   * - Unterbesetzt: laufende Projekte mit Ist < Soll
   * - Nicht im Plan: laufende Nicht-Service-Projekte ohne Fläche
   * - Rote Ampel: laufende Projekte mit Status "Verzug"
   */
  function kennzahlen() {
    const P = daten.personen, L = daten.projekte.filter(function (p) { return laeuft(p); });
    return {
      anwesend: P.filter(function (p) { return p.anwesenheit === "Anwesend" || p.anwesenheit === "Service"; }).length,
      gesamt: P.length,
      ohne: P.filter(function (p) { return p.anwesenheit === "Anwesend" && !p.projektId; }).length,
      unter: L.filter(function (p) { return ist(p.id) < p.soll; }).length,
      plan: L.filter(function (p) { return p.art !== "Service" && !p.flaeche; }).length,
      rot: L.filter(function (p) { return p.status === "Verzug"; }).length
    };
  }

  /* ===========================================================================
     Aktionen
     ========================================================================= */

  /**
   * Legt eine Person auf einem Ziel ab (Drag & Drop oder „Zuordnen…“).
   * Ablagelogik:
   *  - externes/internes Projekt → projektId = Ziel, Anwesenheit "Anwesend"
   *  - Service-Projekt          → projektId = Ziel, Anwesenheit "Service"
   *  - eigene Abteilung Anwesend → projektId null, "Anwesend"
   *  - eigene Abteilung Abwesend → projektId null, "Abwesend"
   *    (Dienstreise/Schulung bleiben erhalten)
   *  - fremde Abteilung          → abgelehnt
   * @param {string} personId
   * @param {{typ:"projekt", projektId:string}|{typ:"abteilung", abteilungId:string, spalte:"an"|"ab"}} ziel
   * @returns {{ok:boolean, meldung?:string}}
   */
  function personAblegen(personId, ziel) {
    const p = person(personId); if (!p) return { ok: false };
    if (ziel.typ === "abteilung" && ziel.abteilungId !== p.abteilungId) {
      return { ok: false, meldung: "Mitarbeitende können nur in der eigenen Abteilung abgelegt werden" };
    }
    if (ziel.typ === "projekt") {
      const pr = projekt(ziel.projektId); if (!pr) return { ok: false };
      const neu = pr.art === "Service" ? "Service" : "Anwesend";
      if (p.projektId === pr.id && p.anwesenheit === neu) return { ok: true };
      const alt = p.projektId ? projekt(p.projektId) : null;
      aenderung(p.name + " → " + pr.name, function () { p.projektId = pr.id; p.anwesenheit = neu; });
      melden(p.name + " → " + pr.name + (pr.art === "Service" ? " (beim Kunden)" : ""), "ok");
      unterbesetztMelden(alt);
      return { ok: true };
    }
    // Abteilung
    const alt = p.projektId ? projekt(p.projektId) : null;
    let neu;
    if (ziel.spalte === "an") neu = "Anwesend";
    else neu = (p.anwesenheit === "Dienstreise" || p.anwesenheit === "Schulung") ? p.anwesenheit : "Abwesend";
    if (!p.projektId && p.anwesenheit === neu) return { ok: true };
    aenderung(p.name + " → " + (ziel.spalte === "an" ? "Anwesend, ohne Projekt" : neu), function () { p.projektId = null; p.anwesenheit = neu; });
    if (ziel.spalte === "ab") melden(p.name + " abwesend gemeldet" + (alt ? " – aus " + alt.name + " genommen" : ""), "warn");
    unterbesetztMelden(alt);
    return { ok: true };
  }

  /** Meldet in der Glocke, wenn ein Projekt durch eine Änderung unterbesetzt ist. */
  function unterbesetztMelden(pr) {
    if (pr && laeuft(pr) && ist(pr.id) < pr.soll) melden(pr.name + " unterbesetzt (" + ist(pr.id) + "/" + pr.soll + ")", "warn");
    Board.render.kopf();
  }

  /**
   * Setzt die Anwesenheit über das Popover.
   *  - Abwesend/Dienstreise/Schulung → Person verlässt ihr Projekt
   *  - Anwesend → verlässt ein Service-Projekt, bleibt sonst im Projekt
   *  - Service  → erfordert ein Service-Projekt (serviceProjektId)
   * @param {string} personId
   * @param {string} wert Anwesenheit
   * @param {string} [serviceProjektId]
   */
  function anwesenheitSetzen(personId, wert, serviceProjektId) {
    const p = person(personId); if (!p) return;
    const alt = p.projektId ? projekt(p.projektId) : null;
    aenderung(p.name + " → " + wert, function () {
      if (wert === "Service") { p.projektId = serviceProjektId; }
      else if (wert === "Anwesend") { if (alt && alt.art === "Service") p.projektId = null; }
      else { p.projektId = null; }
      p.anwesenheit = wert;
    });
    if (wert !== "Anwesend" && wert !== "Service") melden(p.name + ": " + wert + (alt ? " – aus " + alt.name + " genommen" : ""), "warn");
    unterbesetztMelden(alt);
  }

  /** Vorarbeiter-Kennzeichen setzen. */
  function vorarbeiterSetzen(personId, wert) {
    const p = person(personId);
    aenderung(p.name + (wert ? " ist Vorarbeiter" : " ist kein Vorarbeiter"), function () { p.vorarbeiter = !!wert; });
  }

  /**
   * Foto speichern – nur wenn die Foto-Freigabe vorliegt.
   * @param {string} personId
   * @param {string|null} dataUrl verkleinertes Bild (oder null zum Entfernen)
   * @param {boolean} freigabe
   */
  function fotoSetzen(personId, dataUrl, freigabe) {
    const p = person(personId);
    aenderung(dataUrl ? "Foto für " + p.name + " gespeichert" : "Foto von " + p.name + " entfernt", function () {
      p.fotoFreigabe = !!freigabe;
      p.foto = freigabe ? dataUrl : null;
    });
  }

  /**
   * Platziert/verschiebt die Fläche eines Projekts. Kam das Rechteck von einer
   * freien Fläche, wird diese entfernt.
   * @param {string} projektId
   * @param {{x:number,y:number,b:number,t:number}} r
   * @param {string} [freieId] ID der freien Fläche, die ersetzt wird
   */
  function flaecheSetzen(projektId, r, freieId) {
    const pr = projekt(projektId);
    const war = !!pr.flaeche;
    aenderung(pr.name + (war ? " verschoben" : " platziert") + " (" + U.m(r.b) + " × " + U.m(r.t) + " m)", function (d) {
      pr.flaeche = { x: r.x, y: r.y, b: r.b, t: r.t };
      if (freieId) d.freieFlaechen = d.freieFlaechen.filter(function (f) { return f.id !== freieId; });
    });
    ui.auswahl = { art: "p", id: projektId };
  }

  /** Ändert nur die Geometrie (Verschieben/Größe) – ohne Snackbar-Spam, aber mit Undo. */
  function geometrieSetzen(key, r) {
    const art = key[0], id = key.slice(2);
    aenderung(null, function (d) {
      if (art === "p") projekt(id).flaeche = { x: r.x, y: r.y, b: r.b, t: r.t };
      else { const f = d.freieFlaechen.find(function (x) { return x.id === id; }); Object.assign(f, { x: r.x, y: r.y, b: r.b, t: r.t }); }
    });
  }

  /** Tauscht das Projekt einer Fläche: das alte wird „nicht im Plan“. */
  function projektWechseln(altId, neuId) {
    const a = projekt(altId), n = projekt(neuId), r = a.flaeche;
    aenderung(n.name + " ersetzt " + a.name, function () { n.flaeche = Object.assign({}, r); a.flaeche = null; });
    ui.auswahl = { art: "p", id: neuId };
  }

  /** Nimmt ein Projekt aus dem Plan; Personen bleiben zugeordnet. */
  function ausPlanEntfernen(projektId) {
    const pr = projekt(projektId);
    aenderung(pr.name + " aus dem Plan genommen", function () { pr.flaeche = null; });
    ui.auswahl = null;
  }

  /** Legt eine freie Fläche (ohne Projekt) an. */
  function freieFlaecheAnlegen(r) {
    const id = "f" + Date.now().toString(36);
    aenderung("Freie Fläche " + U.m(r.b) + " × " + U.m(r.t) + " m angelegt", function (d) {
      d.freieFlaechen.push({ id: id, x: r.x, y: r.y, b: r.b, t: r.t });
    });
    ui.auswahl = { art: "f", id: id };
  }

  /** Entfernt eine freie Fläche. */
  function freieFlaecheEntfernen(id) {
    aenderung("Freie Fläche entfernt", function (d) { d.freieFlaechen = d.freieFlaechen.filter(function (f) { return f.id !== id; }); });
    ui.auswahl = null;
  }

  /** Alle Flächen leeren (Projekte → nicht im Plan, freie Flächen weg). */
  function flaechenLeeren() {
    aenderung("Alle Flächen geleert", function (d) {
      d.projekte.forEach(function (p) { p.flaeche = null; });
      d.freieFlaechen = [];
    });
    ui.auswahl = null;
  }

  /** Neues Projekt anlegen (ohne Fläche). */
  function projektAnlegen(p) {
    aenderung("Projekt " + p.name + " angelegt", function (d) { d.projekte.push(p); });
    melden("Neues Projekt " + p.nummer + " " + p.name, "ok");
  }

  /**
   * Ersetzt den gesamten Datenstand (Import, Datei-Abgleich).
   * @param {object} neu geprüfter Datenstand
   * @param {string} text Snackbar-Text
   */
  function datenErsetzen(neu, text) {
    aenderung(text, function () {});
    daten = neu;
    ui.auswahl = null;
    speichern();
    Board.render.alles();
  }

  /** Setzt auf die Startdaten zurück (mit Undo). */
  function zuruecksetzen() { datenErsetzen(Board.seed(), "Auf Startdaten zurückgesetzt"); }

  /* ===========================================================================
     Export / Import
     ========================================================================= */

  /** Lädt den Stand als JSON-Datei herunter (Blob-Link, kein Server nötig). */
  function exportieren() {
    const d = new Date();
    const name = "montageboard-" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ".json";
    const blob = new Blob([JSON.stringify(daten, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    U.toast("Exportiert: " + name, "ok");
  }

  /**
   * Liest eine JSON-Datei ein, prüft sie und zeigt eine Vorschau zur Bestätigung.
   * @param {File} file
   */
  function importieren(file) {
    const reader = new FileReader();
    reader.onload = function () {
      let o;
      try { o = JSON.parse(reader.result); } catch (e) { U.toast("Datei ist kein gültiges JSON", "error"); return; }
      const fehler = pruefen(o);
      if (fehler) { U.toast("Import abgelehnt: " + fehler, "error"); return; }
      U.bestaetigen("Daten importieren", o.projekte.length + " Projekte, " + o.personen.length + " Personen – übernehmen? Der aktuelle Stand wird ersetzt (Rückgängig möglich).", "Übernehmen")
        .then(function (ja) { if (ja) datenErsetzen(o, "Import übernommen: " + file.name); });
    };
    reader.onerror = function () { U.toast("Datei konnte nicht gelesen werden", "error"); };
    reader.readAsText(file);
  }

  /* ===========================================================================
     Dateiverbindung (File System Access API) – optional
     Die App schreibt jede Änderung entprellt in eine gewählte JSON-Datei und
     prüft alle 30 s, ob die Datei extern geändert wurde. Der Dateihandle wird
     in IndexedDB gemerkt; nach einem Neustart muss die Berechtigung per Klick
     erneut erteilt werden („Verbindung wiederherstellen“).
     ========================================================================= */
  const datei = {
    verfuegbar: typeof window.showSaveFilePicker === "function",
    handle: null,
    aktiv: false,
    wartetAufErlaubnis: false,
    zuletzt: 0,
    timer: null,
    planen: null
  };

  /** Kleiner IndexedDB-Zugriff zum Merken des Dateihandles. */
  function idb(modus, fn) {
    return new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open("montageboard", 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore("kv"); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        const tx = req.result.transaction("kv", modus);
        const r = fn(tx.objectStore("kv"));
        tx.oncomplete = function () { resolve(r && r.result); };
        tx.onerror = function () { reject(tx.error); };
      };
    });
  }

  /** Schreibt den aktuellen Stand in die verbundene Datei. */
  async function dateiSchreiben() {
    if (!datei.aktiv || !datei.handle) return;
    try {
      syncSetzen("speichert", "Speichere in Datei …");
      const w = await datei.handle.createWritable();
      await w.write(JSON.stringify(daten, null, 1));
      await w.close();
      const f = await datei.handle.getFile();
      datei.zuletzt = f.lastModified;
      syncSetzen("ok", "Gespeichert in " + datei.handle.name);
    } catch (e) {
      syncSetzen("fehler", "Datei-Speichern fehlgeschlagen – Stand liegt im Browser");
      U.toast("Speichern in Datei fehlgeschlagen – der Stand bleibt im Browser gesichert", "error");
    }
  }
  datei.planen = U.entprellen(dateiSchreiben, 1000);

  /** Prüft, ob die Datei extern geändert wurde, und lädt sie dann neu. */
  async function dateiPruefen() {
    if (!datei.aktiv || !datei.handle) return;
    try {
      const f = await datei.handle.getFile();
      if (f.lastModified > datei.zuletzt + 500) {
        const o = JSON.parse(await f.text());
        if (pruefen(o)) return;
        datei.zuletzt = f.lastModified;
        daten = o; ui.auswahl = null;
        localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten));
        Board.render.alles();
        U.toast("Stand aktualisiert (Datei wurde extern geändert)", "ok");
      }
    } catch (e) { syncSetzen("fehler", "Datei nicht erreichbar"); }
  }

  /** Startet die Verbindung mit einem Handle (Berechtigung muss vorliegen). */
  async function dateiStarten(handle, inhaltLaden) {
    datei.handle = handle; datei.aktiv = true; datei.wartetAufErlaubnis = false;
    try { await idb("readwrite", function (s) { return s.put(handle, "datei"); }); } catch (e) { /* Merken optional */ }
    if (inhaltLaden) {
      try {
        const f = await handle.getFile();
        const text = await f.text();
        if (text.trim()) {
          const o = JSON.parse(text);
          if (!pruefen(o)) { daten = o; localStorage.setItem(SPEICHER_SCHLUESSEL, JSON.stringify(daten)); datei.zuletzt = f.lastModified; Board.render.alles(); }
        }
      } catch (e) { U.toast("Dateiinhalt ungültig – aktueller Stand wird hineingeschrieben", "warn"); }
    }
    await dateiSchreiben();
    clearInterval(datei.timer);
    datei.timer = setInterval(dateiPruefen, 30000);
    Board.render.alles();
  }

  /** Neue Datei anlegen und verbinden. */
  async function dateiNeu() {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: "montageboard.json", types: [{ description: "Montageboard (JSON)", accept: { "application/json": [".json"] } }] });
      await dateiStarten(h, false);
      U.toast("Mit Datei verbunden: " + h.name, "ok");
    } catch (e) { if (e && e.name !== "AbortError") dateiFehler(e); }
  }

  /** Vorhandene Datei öffnen (z. B. im Teams-/OneDrive-Ordner) und verbinden. */
  async function dateiOeffnen() {
    try {
      const hs = await window.showOpenFilePicker({ types: [{ description: "Montageboard (JSON)", accept: { "application/json": [".json"] } }] });
      const h = hs[0];
      const perm = await h.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") { U.toast("Schreibrecht wurde nicht erteilt", "warn"); return; }
      await dateiStarten(h, true);
      U.toast("Mit Datei verbunden: " + h.name, "ok");
    } catch (e) { if (e && e.name !== "AbortError") dateiFehler(e); }
  }

  /** Fehlerbehandlung: sauber auf localStorage zurückfallen. */
  function dateiFehler(e) {
    datei.aktiv = false;
    syncSetzen("ok", "Im Browser gespeichert");
    U.toast("Dateiverbindung nicht möglich (" + (e && e.name || "Fehler") + ") – es wird weiter im Browser gespeichert", "warn");
  }

  /** Beim Start: gemerkten Handle suchen; Berechtigung braucht später einen Klick. */
  async function dateiBeimStart() {
    if (!datei.verfuegbar) return;
    try {
      const h = await idb("readonly", function (s) { return s.get("datei"); });
      if (h) { datei.handle = h; datei.wartetAufErlaubnis = true; syncSetzen("speichert", "Dateiverbindung wartet – bitte wiederherstellen"); Board.render.alles(); }
    } catch (e) { /* IndexedDB unter file:// evtl. gesperrt → ignorieren */ }
  }

  /** „Verbindung wiederherstellen“ (muss aus einem Klick heraus aufgerufen werden). */
  async function dateiWiederherstellen() {
    if (!datei.handle) return;
    try {
      const perm = await datei.handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") { U.toast("Berechtigung nicht erteilt – Stand bleibt im Browser", "warn"); return; }
      await dateiStarten(datei.handle, true);
      U.toast("Verbindung wiederhergestellt", "ok");
    } catch (e) { dateiFehler(e); }
  }

  /** Verbindung trennen (Stand bleibt im Browser). */
  async function dateiTrennen() {
    datei.aktiv = false; datei.handle = null; datei.wartetAufErlaubnis = false; clearInterval(datei.timer);
    try { await idb("readwrite", function (s) { return s.delete("datei"); }); } catch (e) { /* egal */ }
    syncSetzen("ok", "Im Browser gespeichert");
    Board.render.alles();
    U.toast("Dateiverbindung getrennt", "info");
  }

  return {
    ui: ui,
    daten: function () { return daten; },
    laden: laden, pruefen: pruefen,
    person: person, projekt: projekt, abteilung: abteilung,
    spalte: spalte, ist: ist, personenAuf: personenAuf, besetzung: besetzung, laeuft: laeuft,
    bereichVon: bereichVon, schneiden: schneiden, ueberschneidungen: ueberschneidungen, kennzahlen: kennzahlen,
    personAblegen: personAblegen, anwesenheitSetzen: anwesenheitSetzen, vorarbeiterSetzen: vorarbeiterSetzen, fotoSetzen: fotoSetzen,
    flaecheSetzen: flaecheSetzen, geometrieSetzen: geometrieSetzen, projektWechseln: projektWechseln, ausPlanEntfernen: ausPlanEntfernen,
    freieFlaecheAnlegen: freieFlaecheAnlegen, freieFlaecheEntfernen: freieFlaecheEntfernen, flaechenLeeren: flaechenLeeren,
    projektAnlegen: projektAnlegen, zuruecksetzen: zuruecksetzen, rueckgaengig: rueckgaengig,
    exportieren: exportieren, importieren: importieren,
    datei: datei, dateiNeu: dateiNeu, dateiOeffnen: dateiOeffnen, dateiBeimStart: dateiBeimStart,
    dateiWiederherstellen: dateiWiederherstellen, dateiTrennen: dateiTrennen
  };
})();
