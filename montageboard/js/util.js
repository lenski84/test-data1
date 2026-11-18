/* =============================================================================
   util.js – Hilfsfunktionen ohne Zustand
   ISO-Kalenderwochen, Formatierung, Initialen, Icons, Toasts und Dialoge.
   ============================================================================= */
window.Board = window.Board || {};

Board.util = (function () {
  "use strict";

  /* ---------------------------------------------------------------------------
     ISO-8601-Kalenderwochen
     Eine KW wird intern als Zahl JJJJWW gespeichert (z. B. 202647). Der direkte
     Zahlenvergleich ist damit auch über den Jahreswechsel korrekt
     (202652 < 202701).
     ------------------------------------------------------------------------- */

  /**
   * Ermittelt ISO-Jahr und ISO-Woche zu einem Datum (Donnerstagsregel:
   * Die Woche gehört zu dem Jahr, in dem ihr Donnerstag liegt).
   * @param {Date} datum
   * @returns {{jahr:number, woche:number}}
   */
  function isoWoche(datum) {
    const d = new Date(Date.UTC(datum.getFullYear(), datum.getMonth(), datum.getDate()));
    const wochentag = d.getUTCDay() || 7;            // Mo=1 … So=7
    d.setUTCDate(d.getUTCDate() + 4 - wochentag);     // auf den Donnerstag der Woche
    const jahresbeginn = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const woche = Math.ceil(((d - jahresbeginn) / 86400000 + 1) / 7);
    return { jahr: d.getUTCFullYear(), woche: woche };
  }

  /** Setzt Jahr und Woche zu einem KW-Schlüssel JJJJWW zusammen. */
  function kwSchluessel(jahr, woche) { return jahr * 100 + woche; }

  /** Zerlegt einen KW-Schlüssel JJJJWW in {jahr, woche}. */
  function kwZerlegen(key) { return { jahr: Math.floor(key / 100), woche: key % 100 }; }

  /**
   * Liefert den Montag (lokale Zeit) einer ISO-Woche.
   * Der 4. Januar liegt immer in KW 1 – von dort aus wird gerechnet.
   * @param {number} jahr  ISO-Jahr
   * @param {number} woche ISO-Woche
   * @returns {Date}
   */
  function montagDerWoche(jahr, woche) {
    const vierterJan = new Date(jahr, 0, 4);
    const tag = vierterJan.getDay() || 7;
    const montagKw1 = new Date(jahr, 0, 4 - (tag - 1));
    return new Date(montagKw1.getFullYear(), montagKw1.getMonth(), montagKw1.getDate() + (woche - 1) * 7);
  }

  /** KW-Schlüssel der aktuellen Woche. */
  function aktuelleKw() { const w = isoWoche(new Date()); return kwSchluessel(w.jahr, w.woche); }

  /**
   * Verschiebt einen KW-Schlüssel um n Wochen (jahresübergreifend korrekt,
   * auch bei Jahren mit 53 Wochen).
   * @param {number} key   JJJJWW
   * @param {number} delta Anzahl Wochen (+/-)
   */
  function kwVerschieben(key, delta) {
    const k = kwZerlegen(key);
    const mo = montagDerWoche(k.jahr, k.woche);
    mo.setDate(mo.getDate() + delta * 7);
    const w = isoWoche(mo);
    return kwSchluessel(w.jahr, w.woche);
  }

  /** Zeitraum Mo–So einer KW als Text, z. B. „16.11.–22.11.2026“. */
  function kwZeitraum(key) {
    const k = kwZerlegen(key);
    const mo = montagDerWoche(k.jahr, k.woche);
    const so = new Date(mo.getFullYear(), mo.getMonth(), mo.getDate() + 6);
    return tm(mo) + "–" + tm(so) + so.getFullYear();
  }
  /** Datum als „TT.MM.“ */
  function tm(d) { return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "."; }
  function pad(n) { return String(n).padStart(2, "0"); }

  /** KW-Schlüssel als Anzeigetext „KW 47“ (mit Jahr, falls abweichend). */
  function kwText(key, mitJahr) {
    const k = kwZerlegen(key);
    return "KW " + k.woche + (mitJahr ? " / " + k.jahr : "");
  }

  /* ---------------------------------------------------------------------------
     Formatierung
     ------------------------------------------------------------------------- */

  /** Initialen aus einem Namen („Lennart Kleemann“ → „LK“, „Hulk“ → „HU“). */
  function initialen(name) {
    const teile = String(name).trim().split(/\s+/);
    if (teile.length === 1) return teile[0].slice(0, 2).toUpperCase();
    return (teile[0][0] + teile[teile.length - 1][0]).toUpperCase();
  }

  /** Nachname (letztes Wort) für die Kartenbeschriftung. */
  function nachname(name) { const t = String(name).trim().split(/\s+/); return t[t.length - 1]; }

  /** Meterwert mit deutschem Komma, max. eine Nachkommastelle („12,5“). */
  function m(v) { return (Math.round(v * 10) / 10).toLocaleString("de-DE", { maximumFractionDigits: 1 }); }

  /** Zahl auf ein Raster runden (z. B. 0,5 m). */
  function fang(v, schritt) { return Math.round(v / schritt) * schritt; }

  /** Wert auf [min, max] begrenzen. */
  function begrenzen(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /** HTML-Sonderzeichen maskieren (Schutz vor kaputtem Markup durch Eingaben). */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /** Erzeugt ein DOM-Element aus einem HTML-String (erstes Element). */
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  /** Führt fn erst aus, wenn ms Millisekunden lang kein weiterer Aufruf kam. */
  function entprellen(fn, ms) {
    let t = null;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); };
  }

  /* ---------------------------------------------------------------------------
     Icons (Inline-SVG, 24×24, Strichstärke über currentColor)
     ------------------------------------------------------------------------- */
  const ICONS = {
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/><circle cx="12" cy="12" r="6.4"/>',
    bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
    cell: '<rect x="3" y="3" width="11" height="11" rx="2"/><rect x="10" y="10" width="11" height="11" rx="2"/>',
    bearing: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="5.5" r="1.3"/><circle cx="12" cy="18.5" r="1.3"/><circle cx="5.5" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
    laser: '<path d="M3 20h18M7 20v-4h10v4M12 16V9M12 9l-3-5h6z"/><path d="M5 10l2 1M19 10l-2 1"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2.5V6M12 2.5V6M15 2.5V6M9 18v3.5M12 18v3.5M15 18v3.5M2.5 9H6M2.5 12H6M2.5 15H6M18 9h3.5M18 12h3.5M18 15h3.5"/>',
    school: '<path d="M2 9.5 12 4l10 5.5-10 5.5z"/><path d="M6 11.8V16c3.5 2.6 8.5 2.6 12 0v-4.2M21 10v5"/>',
    truck: '<path d="M2 6h11v10H2zM13 9h4.5l3.5 3.5V16h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L12 19l-3 1-1-1 1-3 7.7-7.7z"/><path d="M14.7 6.3 17.5 3.5a4 4 0 0 1 3 3l-2.8 2.8"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    // Bedien-Icons
    chevL: '<path d="M15 5l-7 7 7 7"/>', chevR: '<path d="M9 5l7 7-7 7"/>',
    filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    more: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
    draw: '<rect x="4" y="6" width="16" height="12" rx="1.5" stroke-dasharray="3 2"/><path d="M4 6l2 0M4 6v2"/>',
    grid: '<path d="M4 4h16v16H4zM4 12h16M12 4v16"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    pin: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/><path d="M12 8v8M8 12h8"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>'
  };

  /**
   * Liefert ein Inline-SVG-Icon.
   * @param {string} key Schlüssel aus ICONS
   * @param {string} [cls] zusätzliche CSS-Klasse
   */
  function icon(key, cls) {
    return '<svg class="ico ' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[key] || ICONS.box) + "</svg>";
  }

  /* ---------------------------------------------------------------------------
     Toasts, Snackbar, Dialoge (statt alert/confirm/prompt)
     ------------------------------------------------------------------------- */

  /**
   * Zeigt eine kurze Meldung oben mittig.
   * @param {string} text
   * @param {"info"|"ok"|"warn"|"error"} [art]
   */
  function toast(text, art) {
    const box = document.getElementById("toasts");
    const t = el('<div class="toast ' + (art || "info") + '">' + esc(text) + "</div>");
    box.appendChild(t);
    setTimeout(function () { t.classList.add("weg"); }, 3200);
    setTimeout(function () { t.remove(); }, 3600);
  }

  let snackTimer = null;
  /**
   * Snackbar unten mittig mit optionaler Aktion (z. B. „Rückgängig“), 8 s sichtbar.
   * @param {string} text
   * @param {string} [aktionText]
   * @param {Function} [aktion]
   */
  function snackbar(text, aktionText, aktion) {
    const sb = document.getElementById("snackbar");
    sb.innerHTML = '<span class="sb-text">' + esc(text) + "</span>" +
      (aktion ? '<button class="sb-btn" type="button">' + icon("undo") + esc(aktionText) + "</button>" : "") +
      '<span class="sb-timer"></span>';
    sb.classList.add("sichtbar");
    if (aktion) sb.querySelector(".sb-btn").addEventListener("click", function () { sb.classList.remove("sichtbar"); aktion(); });
    clearTimeout(snackTimer);
    snackTimer = setTimeout(function () { sb.classList.remove("sichtbar"); }, 8000);
  }

  /**
   * Öffnet einen In-App-Dialog.
   * @param {object} opt
   * @param {string} opt.titel     Überschrift
   * @param {string} [opt.untertitel]
   * @param {string|Node} opt.inhalt HTML oder DOM-Knoten
   * @param {Array<{text:string, art?:string, aktion?:Function, bleibt?:boolean}>} [opt.knoepfe]
   * @param {Function} [opt.beimSchliessen] wird beim Schließen über X/Hintergrund aufgerufen
   * @param {string} [opt.breite] CSS-Breite, z. B. "36rem"
   * @returns {{schliessen:Function, root:HTMLElement}}
   */
  function dialog(opt) {
    const host = document.getElementById("dialoge");
    const root = el('<div class="dlg-bg"><div class="dlg" role="dialog" aria-modal="true">' +
      '<div class="dlg-kopf"><div><h3></h3><p class="dlg-unter"></p></div><button class="ibtn dlg-x" type="button" aria-label="Schließen">' + icon("x") + "</button></div>" +
      '<div class="dlg-inhalt"></div><div class="dlg-fuss"></div></div></div>');
    const dlg = root.querySelector(".dlg");
    if (opt.breite) dlg.style.width = opt.breite;
    root.querySelector("h3").textContent = opt.titel;
    const unter = root.querySelector(".dlg-unter");
    if (opt.untertitel) unter.textContent = opt.untertitel; else unter.remove();
    const inhalt = root.querySelector(".dlg-inhalt");
    if (typeof opt.inhalt === "string") inhalt.innerHTML = opt.inhalt; else if (opt.inhalt) inhalt.appendChild(opt.inhalt);
    const fuss = root.querySelector(".dlg-fuss");
    let offen = true;
    function schliessen(ueberX) {
      if (!offen) return; offen = false;
      root.remove();
      if (ueberX && opt.beimSchliessen) opt.beimSchliessen();
    }
    (opt.knoepfe || []).forEach(function (k) {
      const b = el('<button type="button" class="btn ' + (k.art || "") + '">' + esc(k.text) + "</button>");
      b.addEventListener("click", function () { if (k.aktion) k.aktion(); if (!k.bleibt) schliessen(false); });
      fuss.appendChild(b);
    });
    if (!fuss.children.length) fuss.remove();
    root.querySelector(".dlg-x").addEventListener("click", function () { schliessen(true); });
    root.addEventListener("pointerdown", function (e) { if (e.target === root) schliessen(true); });
    host.appendChild(root);
    return { schliessen: schliessen, root: root };
  }

  /**
   * Bestätigungsdialog als Promise (Ersatz für confirm()).
   * @param {string} titel
   * @param {string} text
   * @param {string} [okText]
   * @returns {Promise<boolean>}
   */
  function bestaetigen(titel, text, okText) {
    return new Promise(function (resolve) {
      dialog({
        titel: titel, inhalt: "<p class='dlg-text'>" + esc(text) + "</p>", breite: "32rem",
        knoepfe: [
          { text: "Abbrechen", aktion: function () { resolve(false); } },
          { text: okText || "OK", art: "pri", aktion: function () { resolve(true); } }
        ],
        beimSchliessen: function () { resolve(false); }
      });
    });
  }

  /** Schließt alle offenen Dialoge (z. B. bei Inaktivität). */
  function alleDialogeSchliessen() { document.getElementById("dialoge").innerHTML = ""; }

  return {
    isoWoche: isoWoche, kwSchluessel: kwSchluessel, kwZerlegen: kwZerlegen, montagDerWoche: montagDerWoche,
    aktuelleKw: aktuelleKw, kwVerschieben: kwVerschieben, kwZeitraum: kwZeitraum, kwText: kwText,
    initialen: initialen, nachname: nachname, m: m, fang: fang, begrenzen: begrenzen, esc: esc, el: el,
    entprellen: entprellen, icon: icon, toast: toast, snackbar: snackbar, dialog: dialog,
    bestaetigen: bestaetigen, alleDialogeSchliessen: alleDialogeSchliessen
  };
})();
