/* =============================================================================
   render.js – Darstellung von Kopfzeile, Personal, Projekten, Statusleiste
   und Personen-Popover. Liest nur aus Board.state, ändert keine Daten selbst.
   ============================================================================= */
window.Board = window.Board || {};

Board.render = (function () {
  "use strict";
  const U = Board.util, S = Board.state;
  const $ = function (id) { return document.getElementById(id); };

  /** CSS-Kurzklasse je Anwesenheit (für Statuspunkt und Legende). */
  const STATUS_KLASSE = { Anwesend: "an", Service: "sv", Abwesend: "ab", Dienstreise: "dr", Schulung: "sc" };

  /* ===========================================================================
     Bausteine
     ========================================================================= */

  /**
   * Personenkarte („Magnet“).
   * @param {object} p Person
   * @param {boolean} [klein] kleine Variante (auf Flächen/in Listen, ohne Namen)
   * @param {string} [extra] zusätzliche CSS-Klassen
   */
  function karte(p, klein, extra) {
    const st = STATUS_KLASSE[p.anwesenheit] || "an";
    const bild = p.foto && p.fotoFreigabe
      ? '<img src="' + p.foto + '" alt="">'
      : "<span>" + U.esc(U.initialen(p.name)) + "</span>";
    const pr = p.projektId ? S.projekt(p.projektId) : null;
    const titel = p.name + " · " + S.abteilung(p.abteilungId).kuerzel + " · " + p.anwesenheit + (pr ? " · " + pr.name : "") + (p.vorarbeiter ? " · Vorarbeiter" : "");
    return '<div class="karte ' + (klein ? "klein " : "") + (extra || "") + (S.ui.zuordnen === p.id ? " zuordnen" : "") + '" data-person="' + p.id + '" title="' + U.esc(titel) + '">' +
      '<div class="av' + (p.vorarbeiter ? " va" : "") + '">' + bild + '<i class="pkt ' + st + '"></i></div>' +
      (klein ? "" : '<div class="nn">' + U.esc(U.nachname(p.name)) + "</div>") + "</div>";
  }

  /** Status-Pill eines Projekts („Im Plan“, „Verzug +4 AT“ …). */
  function statusPill(pr) {
    const k = { "Im Plan": "gruen", "Verzug": "rot", "Prognose": "gelb", "Abgeschlossen": "grau" }[pr.status] || "grau";
    return '<span class="pill ' + k + '"><i></i>' + U.esc(pr.status + (pr.statusText ? " " + pr.statusText : "")) + "</span>";
  }

  /** Ist/Soll-Badge (grün = passt, rot = unterbesetzt, orange = überbesetzt). */
  function istSoll(pr) {
    const b = S.besetzung(pr);
    return '<span class="istsoll ' + b.klasse + '" title="Ist ' + b.ist + " / Soll " + b.soll + '">' + b.ist + "/" + b.soll + "</span>";
  }

  /* ===========================================================================
     Kopfzeile
     ========================================================================= */

  /** Aktualisiert KW-Anzeige, Glocke, Tabs und Menü. */
  function kopf() {
    const ui = S.ui;
    $("kwText").textContent = U.kwText(ui.kw, U.kwZerlegen(ui.kw).jahr !== U.kwZerlegen(U.aktuelleKw()).jahr);
    $("kwZeit").textContent = U.kwZeitraum(ui.kw);
    $("btnHeute").classList.toggle("aktiv", ui.kw === U.aktuelleKw());
    const n = $("bellZahl"); n.textContent = ui.ungelesen; n.hidden = !ui.ungelesen;
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("aktiv", b.dataset.tab === ui.tab); });
    $("btnFilter").classList.toggle("aktiv", !!ui.filterAbt);
    sync();
  }

  /** Sync-Indikator: grün = gespeichert, gelb = speichert/wartet, rot = Fehler. */
  function sync() {
    const d = $("syncPunkt"); if (!d) return;
    d.className = "sync " + S.ui.sync;
    d.title = S.ui.syncText;
    $("syncText").textContent = S.ui.sync === "ok" ? "gespeichert" : S.ui.sync === "speichert" ? (S.datei.wartetAufErlaubnis ? "Datei getrennt" : "speichert …") : "Fehler";
  }

  /* ===========================================================================
     Personal (links)
     ========================================================================= */

  /** Zeichnet die Tabelle Abteilung | Anwesend | Abwesend. */
  function personal() {
    const d = S.daten(), ui = S.ui;
    let nAn = 0, nAb = 0;
    const zeilen = d.abteilungen.map(function (a) {
      const an = [], ab = [];
      d.personen.forEach(function (p) {
        if (p.abteilungId !== a.id) return;
        const o = S.ort(p);
        if (o.typ !== "abteilung") return;
        (o.spalte === "an" ? an : ab).push(p);
      });
      nAn += an.length; nAb += ab.length;
      const hlOhne = ui.hervorheben === "ohne" ? " hl" : "";
      return '<div class="pt-zeile' + (ui.filterAbt && ui.filterAbt !== a.id ? " gedimmt" : "") + '">' +
        '<div class="abt"><b>' + U.esc(a.kuerzel) + "</b><small>" + U.esc(a.funktion === "Inbetriebnahme" ? "IBN" : "Montage") + "</small></div>" +
        '<div class="zone an' + (ui.hervorheben === "anwesend" ? " hl" : "") + '" data-drop="abteilung" data-abt="' + a.id + '" data-spalte="an">' +
          (an.length ? an.map(function (p) { return karte(p, false, hlOhne); }).join("") : '<span class="leer">–</span>') + "</div>" +
        '<div class="zone ab" data-drop="abteilung" data-abt="' + a.id + '" data-spalte="ab">' +
          (ab.length ? ab.map(function (p) { return karte(p); }).join("") : '<span class="leer">–</span>') + "</div>" +
        "</div>";
    }).join("");
    $("personal").innerHTML =
      '<div class="pt-kopf"><span></span><span class="h-an"><i class="pkt an"></i>Anwesend<b>' + nAn + '</b></span>' +
      '<span class="h-ab"><i class="pkt ab"></i>Abwesend<b>' + nAb + "</b></span></div>" + zeilen;
  }

  /* ===========================================================================
     Projekte (rechts)
     ========================================================================= */

  /**
   * Ein Listeneintrag. Projekte ohne Fläche und Service-Projekte zeigen ihre
   * Personen hier (dort „liegt“ der Magnet).
   */
  function eintrag(pr, ausserhalb) {
    const ui = S.ui;
    const zeigtPersonen = pr.art === "Service" || !pr.flaeche;
    const leute = zeigtPersonen ? S.personenAuf(pr.id) : [];
    const hl = (ui.hervorheben === "plan" && pr.art !== "Service" && !pr.flaeche && !ausserhalb) ||
               (ui.hervorheben === "rot" && pr.status === "Verzug" && !ausserhalb) ||
               (ui.hervorheben === "unter" && S.ist(pr.id) < pr.soll && !ausserhalb);
    return '<div class="eintrag' + (ausserhalb ? " aus" : "") + (hl ? " hl" : "") + (ui.puls === pr.id ? " puls" : "") + '" data-drop="projekt" data-projekt="' + pr.id + '" data-eintrag="' + pr.id + '">' +
      '<div class="e-zeile"><span class="e-ico">' + U.icon(pr.icon) + "</span>" +
      '<div class="e-tx"><b>' + U.esc(pr.name) + "</b><span>" + U.esc(pr.unterzeile) + " · " + U.esc(pr.nummer) + "</span></div>" +
      (pr.art !== "Service" && !pr.flaeche ? '<span class="chip-np">' + U.icon("pin") + "nicht im Plan</span>" : "") +
      (zeigtPersonen ? istSoll(pr) : "") + statusPill(pr) + "</div>" +
      (zeigtPersonen ? '<div class="e-pers">' + (leute.length ? leute.map(function (p) { return karte(p, true); }).join("") : '<span class="leer">Person hierher ziehen</span>') + "</div>" : "") +
      "</div>";
  }

  /** Zeichnet die Projektliste mit Abschnitten Extern / Intern / Beim Kunden / Weitere. */
  function projekte() {
    const d = S.daten(), ui = S.ui;
    const laufend = d.projekte.filter(function (p) { return S.laeuft(p); });
    const weitere = d.projekte.filter(function (p) { return !S.laeuft(p); });
    function abschnitt(titel, liste) {
      return '<div class="abschnitt"><h3>' + titel + '<span class="anz">' + liste.length + "</span></h3>" +
        (liste.length ? liste.map(function (p) { return eintrag(p, false); }).join("") : '<p class="leer-text">keine laufenden Projekte in dieser KW</p>') + "</div>";
    }
    $("projekte").innerHTML =
      abschnitt("Externe Projekte", laufend.filter(function (p) { return p.art === "Extern"; })) +
      abschnitt("Interne Projekte", laufend.filter(function (p) { return p.art === "Intern"; })) +
      abschnitt("Beim Kunden", laufend.filter(function (p) { return p.art === "Service"; })) +
      (weitere.length ? '<details class="weitere"' + (ui.weitereOffen ? " open" : "") + '><summary>Weitere Projekte <span class="anz">' + weitere.length + "</span><small>nicht in " + U.kwText(ui.kw) + "</small></summary>" +
        weitere.map(function (p) { return eintrag(p, true); }).join("") + "</details>" : "");
    const det = document.querySelector("#projekte details.weitere");
    if (det) det.addEventListener("toggle", function () { ui.weitereOffen = det.open; });
  }

  /* ===========================================================================
     Statusleiste
     ========================================================================= */

  /** Legende und live berechnete Kennzahl-Chips. */
  function statusleiste() {
    const k = S.kennzahlen(), h = S.ui.hervorheben;
    function chip(key, text, wert, warn) {
      return '<button type="button" class="kchip' + (warn && wert ? " warn" : "") + (h === key ? " aktiv" : "") + '" data-kpi="' + key + '">' + text + "<b>" + wert + "</b></button>";
    }
    $("statusleiste").innerHTML =
      '<div class="legende">' +
        '<span><i class="pkt an"></i>Anwesend</span><span><i class="pkt sv"></i>Ext. Service</span><span><i class="pkt ab"></i>Krank/Urlaub</span>' +
        '<span><i class="pkt dr"></i>Dienstreise</span><span><i class="pkt sc"></i>Schulung</span><span><i class="ring"></i>Vorarbeiter</span></div>' +
      '<div class="kpis">' +
        chip("anwesend", "Anwesend", k.anwesend + "<small>/" + k.gesamt + "</small>") +
        chip("ohne", "Ohne Projekt", k.ohne) +
        chip("unter", "Unterbesetzt", k.unter, true) +
        chip("plan", "Nicht im Plan", k.plan) +
        chip("rot", "Rote Ampel", k.rot, true) +
      "</div>";
  }

  /* ===========================================================================
     Tabs (Board / Platzhalter)
     ========================================================================= */
  function tabs() {
    const board = S.ui.tab === "board";
    $("haupt").hidden = !board;
    $("platzhalter").hidden = board;
    if (!board) {
      const name = { forecast: "Forecast", massnahmen: "Maßnahmen", auswertung: "Auswertung", stammdaten: "Stammdaten" }[S.ui.tab];
      $("platzhalter").innerHTML = '<div class="ph-karte"><h2>' + name + "</h2><p>Diese Ansicht folgt in einer späteren Ausbaustufe.</p>" +
        '<button class="btn pri" type="button" data-tab="board">Zurück zum Board</button></div>';
    }
  }

  /* ===========================================================================
     Personen-Popover (Antippen einer Karte)
     ========================================================================= */
  let popover = null; // { personId, x, y, serviceWahl }

  /**
   * Öffnet das Popover zu einer Person neben der angetippten Karte.
   * @param {string} personId
   * @param {DOMRect} rect Position der Karte
   */
  function popoverOeffnen(personId, rect) {
    popover = { personId: personId, rect: rect, serviceWahl: false };
    popoverZeichnen();
  }
  function popoverSchliessen() { popover = null; $("popover").innerHTML = ""; }
  function popoverOffen() { return !!popover; }

  /** Zeichnet den Inhalt des Popovers (auch nach Änderungen). */
  function popoverZeichnen() {
    const host = $("popover");
    if (!popover) { host.innerHTML = ""; return; }
    const p = S.person(popover.personId); if (!p) { popoverSchliessen(); return; }
    const a = S.abteilung(p.abteilungId), pr = p.projektId ? S.projekt(p.projektId) : null;
    const werte = ["Anwesend", "Abwesend", "Service", "Dienstreise", "Schulung"];
    const services = S.daten().projekte.filter(function (x) { return x.art === "Service" && S.laeuft(x); });
    host.innerHTML =
      '<div class="pop" role="dialog">' +
        '<div class="pop-kopf">' + karte(p, true, "gross") +
          '<div><div class="pop-name">' + U.esc(p.name) + '</div><div class="pop-meta">' + U.esc(a.kuerzel + " · " + a.funktion + " · " + p.personalnr) + "</div></div>" +
          '<button class="ibtn" type="button" data-pop="zu" aria-label="Schließen">' + U.icon("x") + "</button></div>" +
        '<div class="pop-feld"><label>Projekt</label><div class="pop-wert">' + (pr ? U.icon(pr.icon) + "<b>" + U.esc(pr.name) + "</b><span>" + U.esc(pr.art) + "</span>" : "<span>kein Projekt</span>") + "</div></div>" +
        '<div class="pop-feld"><label>Status</label><div class="st-grid">' +
          werte.map(function (w) { return '<button type="button" class="st-btn' + (p.anwesenheit === w ? " aktiv" : "") + '" data-status="' + w + '"><i class="pkt ' + STATUS_KLASSE[w] + '"></i>' + w + "</button>"; }).join("") +
        "</div>" +
        (popover.serviceWahl ? '<div class="svc-wahl"><label>Service-Projekt wählen</label>' +
          (services.length ? services.map(function (s) { return '<button type="button" class="btn" data-service="' + s.id + '">' + U.icon(s.icon) + U.esc(s.name) + "</button>"; }).join("") : "<span>kein laufendes Service-Projekt</span>") + "</div>" : "") +
        "</div>" +
        '<div class="pop-feld zeile"><label>Vorarbeiter</label><button type="button" class="schalter' + (p.vorarbeiter ? " an" : "") + '" data-pop="va" aria-pressed="' + p.vorarbeiter + '"><i></i></button></div>' +
        '<div class="pop-feld"><label>Foto</label><div class="foto-zeile">' +
          '<label class="check"><input type="checkbox" data-pop="freigabe"' + (p.fotoFreigabe ? " checked" : "") + "> Foto-Freigabe liegt vor</label>" +
          '<button type="button" class="btn" data-pop="foto">' + U.icon("camera") + (p.foto ? "Ändern" : "Foto hinzufügen") + "</button>" +
          (p.foto ? '<button type="button" class="btn" data-pop="fotoweg">Entfernen</button>' : "") +
          '<input type="file" accept="image/*" hidden data-pop="datei"></div></div>' +
        '<div class="pop-fuss"><button type="button" class="btn pri" data-pop="zuordnen">' + U.icon("swap") + "Zuordnen …</button></div>" +
      "</div>";
    // Position: rechts neben der Karte, sonst links; innerhalb des Fensters
    const pop = host.firstChild, r = popover.rect;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = r.right + 12; if (x + w > innerWidth - 8) x = r.left - w - 12; if (x < 8) x = 8;
    let y = r.top - 20; if (y + h > innerHeight - 8) y = innerHeight - h - 8; if (y < 8) y = 8;
    pop.style.left = x + "px"; pop.style.top = y + "px";
  }

  /** Popover-Klicks auswerten (Status, Vorarbeiter, Foto, Zuordnen). */
  function popoverKlick(e) {
    if (!popover) return;
    const p = S.person(popover.personId);
    const t = e.target.closest("[data-status],[data-service],[data-pop]"); if (!t) return;
    if (t.dataset.status) {
      const w = t.dataset.status;
      if (w === "Service") {
        const pr = p.projektId ? S.projekt(p.projektId) : null;
        if (pr && pr.art === "Service") { S.anwesenheitSetzen(p.id, "Service", pr.id); return; }
        popover.serviceWahl = true; popoverZeichnen(); return;
      }
      S.anwesenheitSetzen(p.id, w); popoverZeichnen(); return;
    }
    if (t.dataset.service) { S.anwesenheitSetzen(p.id, "Service", t.dataset.service); popover.serviceWahl = false; popoverZeichnen(); return; }
    const k = t.dataset.pop;
    if (k === "zu") popoverSchliessen();
    else if (k === "va") { S.vorarbeiterSetzen(p.id, !p.vorarbeiter); popoverZeichnen(); }
    else if (k === "foto") {
      const cb = $("popover").querySelector('[data-pop="freigabe"]');
      if (!cb.checked) { U.toast("Bitte zuerst bestätigen, dass die Foto-Freigabe vorliegt", "warn"); return; }
      $("popover").querySelector('[data-pop="datei"]').click();
    }
    else if (k === "fotoweg") { S.fotoSetzen(p.id, null, p.fotoFreigabe); popoverZeichnen(); }
    else if (k === "zuordnen") {
      S.ui.zuordnen = p.id; popoverSchliessen(); alles();
      U.toast("Ziel antippen: Projekt, Fläche oder Abteilungszone (Esc = abbrechen)", "info");
    }
  }

  /** Reaktion auf Checkbox/Datei im Popover. */
  function popoverAenderung(e) {
    if (!popover) return;
    const p = S.person(popover.personId), t = e.target;
    if (t.dataset.pop === "freigabe") {
      if (!t.checked && p.foto) { S.fotoSetzen(p.id, null, false); popoverZeichnen(); }
    }
    if (t.dataset.pop === "datei" && t.files && t.files[0]) {
      bildVerkleinern(t.files[0], 256).then(function (url) { S.fotoSetzen(p.id, url, true); popoverZeichnen(); })
        .catch(function () { U.toast("Bild konnte nicht gelesen werden", "error"); });
    }
  }

  /**
   * Verkleinert ein Bild per Canvas auf max. kante × kante Pixel (quadratisch
   * zugeschnitten) und liefert eine JPEG-dataURL.
   * @param {File} file
   * @param {number} kante
   * @returns {Promise<string>}
   */
  function bildVerkleinern(file, kante) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        const s = Math.min(img.width, img.height);
        const c = document.createElement("canvas"); c.width = c.height = kante;
        c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, kante, kante);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(); };
      img.src = url;
    });
  }

  /* ===========================================================================
     Alles neu zeichnen
     ========================================================================= */
  function alles() {
    kopf(); personal(); projekte(); statusleiste(); tabs();
    if (Board.hall) Board.hall.render();
    if (popover) popoverZeichnen();
  }

  return {
    alles: alles, kopf: kopf, sync: sync, personal: personal, projekte: projekte, statusleiste: statusleiste,
    karte: karte, istSoll: istSoll, statusPill: statusPill,
    popoverOeffnen: popoverOeffnen, popoverSchliessen: popoverSchliessen, popoverOffen: popoverOffen,
    popoverKlick: popoverKlick, popoverAenderung: popoverAenderung, STATUS_KLASSE: STATUS_KLASSE
  };
})();
