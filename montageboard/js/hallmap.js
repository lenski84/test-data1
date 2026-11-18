/* =============================================================================
   hallmap.js – Hallenplan
   -----------------------------------------------------------------------------
   Aufbau (alles in einer „Bühne“ mit dem Seitenverhältnis der Halle):
     1. #hallBg   – maßstäbliches SVG (viewBox in Metern): Umriss, Raster,
                    Montagebereiche, Hauptgang, Tor
     2. #hallLayer – HTML-Ebene mit den Projektflächen (Positionen in %, also
                    ebenfalls maßstäblich). HTML statt SVG-Text, weil Umbruch,
                    Kürzung und Personenkarten so sauber und touchfähig bleiben.
     3. #hallFx   – SVG-Ebene für Fadenkreuz und das gerade aufgezogene Rechteck
   Interaktion ausschließlich über Pointer Events.
   ============================================================================= */
window.Board = window.Board || {};

Board.hall = (function () {
  "use strict";
  const U = Board.util, S = Board.state;
  const $ = function (id) { return document.getElementById(id); };

  let skala = 10;     // Pixel pro Meter (wird bei Größenänderung berechnet)
  let zug = null;     // laufende Zeigeraktion (Aufziehen, Verschieben, Größe, Tippen)
  let stage, layer, fx, chip;

  /** Halle-Abmessungen aus dem Datenstand. */
  function H() { return S.daten().halle; }
  /** Rasterweite: 0,5 m bei aktivem Rasterfang, sonst 0,1 m. */
  function raster() { return S.ui.raster ? 0.5 : 0.1; }
  /** Prozentwert einer Meterangabe bezogen auf Breite/Tiefe. */
  function pb(v) { return (v / H().breiteM * 100) + "%"; }
  function pt(v) { return (v / H().tiefeM * 100) + "%"; }
  /** CSS-Position eines Rechtecks in Prozent. */
  function lage(r) { return "left:" + pb(r.x) + ";top:" + pt(r.y) + ";width:" + pb(r.b) + ";height:" + pt(r.t); }
  /** Pixel je rem (für Platzberechnungen der Personenkarten). */
  function rem() { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; }

  /* ===========================================================================
     Initialisierung & Größe
     ========================================================================= */

  /** Verdrahtet Elemente und Ereignisse; einmal beim Start aufrufen. */
  function init() {
    stage = $("hallStage"); layer = $("hallLayer"); fx = $("hallFx"); chip = $("hallChip");
    if (window.ResizeObserver) new ResizeObserver(groesse).observe($("hallWrap"));
    window.addEventListener("resize", groesse);
    stage.addEventListener("pointerdown", runter);
    stage.addEventListener("pointermove", bewegen);
    stage.addEventListener("pointerup", hoch);
    stage.addEventListener("pointercancel", abbruch);
    stage.addEventListener("pointerleave", function () { if (!zug) fadenkreuz(null); });
    stage.addEventListener("click", kontextKlick);
    groesse();
  }

  /** Passt die Bühne an den verfügbaren Platz an (Seitenverhältnis bleibt). */
  function groesse() {
    const w = $("hallWrap"); if (!w || !S.daten()) return;
    const cs = getComputedStyle(w);
    const cw = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ch = w.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    if (cw <= 0 || ch <= 0) return;
    skala = Math.min(cw / H().breiteM, ch / H().tiefeM);
    stage.style.width = Math.floor(H().breiteM * skala) + "px";
    stage.style.height = Math.floor(H().tiefeM * skala) + "px";
    render();
  }

  /* ===========================================================================
     Zeichnen
     ========================================================================= */

  /** Zeichnet Hintergrund und Flächen neu. */
  function render() {
    if (!stage) return;
    hintergrund();
    flaechen();
    document.querySelectorAll("#modus button").forEach(function (b) { b.classList.toggle("aktiv", b.dataset.modus === S.ui.modus); });
    $("btnRaster").classList.toggle("aktiv", S.ui.raster);
    stage.classList.toggle("aufziehen", S.ui.modus === "aufziehen");
  }

  /** Maßstäblicher Grundriss als SVG (Einheit: Meter). */
  function hintergrund() {
    const h = H(), W = h.breiteM, T = h.tiefeM, g = h.hauptgang;
    let s = '<defs>' +
      '<pattern id="r1" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="#E9ECEF" stroke-width="0.03"/></pattern>' +
      '<pattern id="r5" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="url(#r1)"/><path d="M5 0H0V5" fill="none" stroke="#D3D8DD" stroke-width="0.05"/></pattern>' +
      "</defs>";
    s += '<rect x="0" y="0" width="' + W + '" height="' + T + '" fill="#FFFFFF"/>';
    s += '<rect x="0" y="0" width="' + W + '" height="' + T + '" fill="url(#r5)"/>';
    // Montagebereiche mit grünem Seitenbalken und senkrechtem Label
    h.bereiche.forEach(function (b) {
      s += '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.b + '" height="' + b.t + '" rx="0.4" fill="#E8F4EC" fill-opacity="0.85" stroke="#B9DAC5" stroke-width="0.08"/>';
      s += '<rect x="' + b.x + '" y="' + b.y + '" width="1.5" height="' + b.t + '" rx="0.4" fill="#00893D"/>';
      const kurz = b.id.toUpperCase();
      s += '<text x="' + (b.x + 0.75) + '" y="' + (b.y + b.t / 2) + '" transform="rotate(-90 ' + (b.x + 0.75) + " " + (b.y + b.t / 2) + ')" text-anchor="middle" dominant-baseline="central" font-size="0.75" font-weight="700" letter-spacing="0.25" fill="#FFFFFF">' + U.esc(kurz) + "</text>";
    });
    // Hauptgang: gestrichelte Mittellinie mit Beschriftung
    const ym = g.y + g.t / 2;
    s += '<line x1="2" y1="' + ym + '" x2="' + (W - 2) + '" y2="' + ym + '" stroke="#9AA3AB" stroke-width="0.12" stroke-dasharray="0.9 0.6"/>';
    s += '<rect x="' + (W / 2 - 4.2) + '" y="' + (ym - 0.6) + '" width="8.4" height="1.2" fill="#FFFFFF"/>';
    s += '<text x="' + W / 2 + '" y="' + ym + '" text-anchor="middle" dominant-baseline="central" font-size="0.72" font-weight="700" letter-spacing="0.35" fill="#6B7580">' + U.esc(g.label.toUpperCase()) + "</text>";
    // Außenwand mit Öffnungen für Tore (Tor liegt im Hauptgang an der Wand)
    const wand = 0.35;
    let links = [[0, T]];
    h.tore.forEach(function (t) {
      if (t.x === 0) links = [[0, t.y], [t.y + g.t, T]];
    });
    s += '<g stroke="#1D2329" stroke-width="' + wand + '" stroke-linecap="square">';
    const o = wand / 2; // Wand vollständig innerhalb der Halle zeichnen
    s += '<line x1="' + o + '" y1="' + o + '" x2="' + (W - o) + '" y2="' + o + '"/><line x1="' + (W - o) + '" y1="' + o + '" x2="' + (W - o) + '" y2="' + (T - o) + '"/><line x1="' + o + '" y1="' + (T - o) + '" x2="' + (W - o) + '" y2="' + (T - o) + '"/>';
    links.forEach(function (a) { s += '<line x1="' + o + '" y1="' + Math.max(o, a[0]) + '" x2="' + o + '" y2="' + Math.min(T - o, a[1]) + '"/>'; });
    s += "</g>";
    h.tore.forEach(function (t) {
      s += '<path d="M0.25 ' + (t.y + 0.4) + "v" + (g.t - 0.8) + '" stroke="#00893D" stroke-width="0.3"/>';
      s += '<text x="0.9" y="' + (t.y + g.t / 2) + '" dominant-baseline="central" font-size="0.62" font-weight="700" letter-spacing="0.15" fill="#1D2329">' + U.esc(t.name.toUpperCase()) + "</text>";
    });
    const bg = $("hallBg");
    bg.setAttribute("viewBox", "0 0 " + W + " " + T);
    bg.innerHTML = s;
    fx.setAttribute("viewBox", "0 0 " + W + " " + T);
  }

  /** Zeichnet alle Projektflächen und freien Flächen als HTML-Ebene. */
  function flaechen() {
    const d = S.daten(), ui = S.ui, R = rem();
    const ueber = S.ueberschneidungen();
    let html = "";
    d.projekte.forEach(function (pr) {
      if (!pr.flaeche || pr.art === "Service") return;
      const key = "p:" + pr.id, r = pr.flaeche;
      const sel = ui.auswahl && ui.auswahl.art === "p" && ui.auswahl.id === pr.id;
      const wpx = r.b * skala, hpx = r.t * skala;
      const kopfH = 1.9 * R, av = 2.75 * R + 4;
      const gross = hpx >= 11.5 * R && wpx >= 8 * R;
      const inhaltH = gross ? 4.9 * R : 1.6 * R;
      const spalten = Math.max(1, Math.floor((wpx - 10) / av));
      const zeilen = Math.max(0, Math.floor((hpx - kopfH - inhaltH - 6) / av));
      const max = spalten * Math.max(zeilen, 1);
      const leute = S.personenAuf(pr.id);
      const zeig = leute.length > max ? leute.slice(0, max - 1) : leute;
      const hl = (ui.hervorheben === "unter" && S.ist(pr.id) < pr.soll && S.laeuft(pr)) || (ui.hervorheben === "rot" && pr.status === "Verzug" && S.laeuft(pr));
      html += '<div class="flaeche p' + (S.laeuft(pr) ? "" : " aus") + (sel ? " sel" : "") + (ueber.has(key) ? " ueber" : "") +
        (ui.puls === pr.id ? " puls" : "") + (hl ? " hl" : "") + (gross ? "" : " kompakt") + (pr.art === "Intern" ? " intern" : "") +
        '" data-key="' + key + '" data-drop="projekt" data-projekt="' + pr.id + '" style="' + lage(r) + '">' +
        '<div class="f-kopf" data-griff="bewegen"><span>' + U.esc(pr.nummer) + "</span>" + Board.render.istSoll(pr) + "</div>" +
        '<div class="f-inhalt">' + (gross ? '<span class="f-ico">' + U.icon(pr.icon) + "</span>" : "") +
          '<b class="f-name">' + U.esc(pr.name) + "</b>" + (gross ? '<span class="f-sub">' + U.esc(pr.unterzeile) + "</span>" : "") + "</div>" +
        '<div class="f-pers">' + zeig.map(function (p) { return Board.render.karte(p, true); }).join("") +
          (leute.length > zeig.length ? '<span class="mehr">+' + (leute.length - zeig.length) + "</span>" : "") + "</div>" +
        (sel ? griffe() : "") + "</div>";
    });
    d.freieFlaechen.forEach(function (f) {
      const key = "f:" + f.id, sel = ui.auswahl && ui.auswahl.art === "f" && ui.auswahl.id === f.id;
      html += '<div class="flaeche frei' + (sel ? " sel" : "") + (ueber.has(key) ? " ueber" : "") + '" data-key="' + key + '" style="' + lage(f) + '"' + (sel ? ' data-griff="bewegen"' : "") + ">" +
        '<div class="f-frei">' + U.icon("pin") + "<b>Freie Fläche " + U.m(f.b) + " × " + U.m(f.t) + " m</b><span>Projekt platzieren</span></div>" +
        (sel ? griffe() : "") + "</div>";
    });
    if (ueber.size) html += '<div class="hinweis-ueber">' + U.icon("x") + "Flächen überschneiden sich</div>";
    html += kontextleiste();
    layer.innerHTML = html;
  }

  /** Vier Eck-Griffe (je 44 px Touch-Fläche). */
  function griffe() {
    return ["nw", "ne", "sw", "se"].map(function (e) { return '<span class="griff ' + e + '" data-griff="' + e + '"><i></i></span>'; }).join("");
  }

  /** Kontextleiste über/unter der ausgewählten Fläche. */
  function kontextleiste() {
    const a = S.ui.auswahl; if (!a) return "";
    let r, knoepfe;
    if (a.art === "p") {
      const pr = S.projekt(a.id); if (!pr || !pr.flaeche) return "";
      r = pr.flaeche;
      knoepfe = '<button type="button" class="kbtn" data-kontext="wechseln">' + U.icon("swap") + "Projekt wechseln</button>" +
                '<button type="button" class="kbtn" data-kontext="entfernen">' + U.icon("trash") + "Aus Plan entfernen</button>";
    } else {
      r = S.daten().freieFlaechen.find(function (f) { return f.id === a.id; }); if (!r) return "";
      knoepfe = '<button type="button" class="kbtn" data-kontext="platzieren">' + U.icon("plus") + "Projekt platzieren</button>" +
                '<button type="button" class="kbtn" data-kontext="frei-weg">' + U.icon("trash") + "Entfernen</button>";
    }
    const oben = r.y > 3.5;
    // Rechts im Plan rechtsbündig ausrichten, damit die Leiste nicht aus der Halle ragt
    const horiz = r.x + r.b / 2 > H().breiteM / 2 ? "right:" + pb(H().breiteM - r.x - r.b) : "left:" + pb(r.x);
    return '<div class="kontext ' + (oben ? "oben" : "unten") + '" style="' + horiz + ";" + (oben ? "bottom:" + pt(H().tiefeM - r.y) : "top:" + pt(r.y + r.t)) + '">' +
      '<span class="kmass" id="kMass">' + U.m(r.b) + " × " + U.m(r.t) + " m</span>" + knoepfe + "</div>";
  }

  /* ===========================================================================
     Zeiger-Interaktion
     ========================================================================= */

  /** Bildschirmkoordinaten → Meter in der Halle. */
  function inMeter(e) {
    const b = stage.getBoundingClientRect();
    return { x: (e.clientX - b.left) / b.width * H().breiteM, y: (e.clientY - b.top) / b.height * H().tiefeM };
  }

  /** Rechteck einer Fläche über ihren Schlüssel „p:id“ / „f:id“. */
  function rechteck(key) {
    if (key[0] === "p") return S.projekt(key.slice(2)).flaeche;
    return S.daten().freieFlaechen.find(function (f) { return f.id === key.slice(2); });
  }

  /** Aus zwei Eckpunkten ein normiertes, gefangenes und begrenztes Rechteck. */
  function ausEcken(a, b) {
    const st = raster(), W = H().breiteM, T = H().tiefeM;
    const x1 = U.begrenzen(U.fang(Math.min(a.x, b.x), st), 0, W), x2 = U.begrenzen(U.fang(Math.max(a.x, b.x), st), 0, W);
    const y1 = U.begrenzen(U.fang(Math.min(a.y, b.y), st), 0, T), y2 = U.begrenzen(U.fang(Math.max(a.y, b.y), st), 0, T);
    return { x: x1, y: y1, b: +(x2 - x1).toFixed(2), t: +(y2 - y1).toFixed(2) };
  }

  function runter(e) {
    if (e.button > 0) return;
    if (e.target.closest("[data-person]") || e.target.closest(".kontext") || S.ui.zuordnen) return;
    const m = inMeter(e);
    if (S.ui.modus === "aufziehen") {
      zug = { art: "zeichnen", a: m, r: null };
      stage.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }
    const f = e.target.closest(".flaeche"), g = e.target.closest("[data-griff]");
    const key = f && f.dataset.key;
    const sel = S.ui.auswahl && key === S.ui.auswahl.art + ":" + S.ui.auswahl.id;
    if (f && g && sel) {
      const r = rechteck(key);
      zug = { art: g.dataset.griff === "bewegen" ? "bewegen" : "groesse", ecke: g.dataset.griff, key: key, el: f, o: Object.assign({}, r), m0: m, r: Object.assign({}, r), bewegt: false };
      stage.setPointerCapture(e.pointerId); e.preventDefault();
      return;
    }
    zug = { art: "tippen", key: key || null, m0: m };
  }

  function bewegen(e) {
    const m = inMeter(e);
    if (!zug) { if (S.ui.modus === "aufziehen") fadenkreuz(m); return; }
    if (zug.art === "zeichnen") {
      fadenkreuz(m);
      zug.r = ausEcken(zug.a, m);
      const zuKlein = zug.r.b < 2 || zug.r.t < 2;
      const ueber = !zuKlein && S.ueberschneidungen({ key: "neu", r: zug.r }).has("neu");
      fx.querySelector(".zieh") && fx.querySelector(".zieh").remove();
      fx.insertAdjacentHTML("beforeend", '<rect class="zieh' + (zuKlein || ueber ? " schlecht" : "") + '" x="' + zug.r.x + '" y="' + zug.r.y + '" width="' + zug.r.b + '" height="' + zug.r.t + '"/>');
      chipZeigen(e, U.m(zug.r.b) + " × " + U.m(zug.r.t) + " m" + (zuKlein ? " · min. 2 × 2 m" : ueber ? " · Überschneidung" : ""));
      return;
    }
    if (zug.art === "tippen") return;
    const st = raster(), W = H().breiteM, T = H().tiefeM, o = zug.o;
    const dx = U.fang(m.x - zug.m0.x, st), dy = U.fang(m.y - zug.m0.y, st);
    if (Math.abs(m.x - zug.m0.x) * skala > 3 || Math.abs(m.y - zug.m0.y) * skala > 3) zug.bewegt = true;
    let r;
    if (zug.art === "bewegen") {
      r = { x: U.begrenzen(U.fang(o.x + dx, st), 0, W - o.b), y: U.begrenzen(U.fang(o.y + dy, st), 0, T - o.t), b: o.b, t: o.t };
    } else {
      // Größe: gegenüberliegende Ecke bleibt fest
      let x1 = o.x, y1 = o.y, x2 = o.x + o.b, y2 = o.y + o.t;
      if (zug.ecke.indexOf("w") >= 0) x1 = U.begrenzen(U.fang(m.x, st), 0, x2 - 2);
      if (zug.ecke.indexOf("e") >= 0) x2 = U.begrenzen(U.fang(m.x, st), x1 + 2, W);
      if (zug.ecke.indexOf("n") >= 0) y1 = U.begrenzen(U.fang(m.y, st), 0, y2 - 2);
      if (zug.ecke.indexOf("s") >= 0) y2 = U.begrenzen(U.fang(m.y, st), y1 + 2, T);
      r = { x: x1, y: y1, b: +(x2 - x1).toFixed(2), t: +(y2 - y1).toFixed(2) };
    }
    zug.r = r;
    zug.el.setAttribute("style", lage(r));
    const ueber = S.ueberschneidungen({ key: zug.key, r: r });
    layer.querySelectorAll(".flaeche").forEach(function (el) { el.classList.toggle("ueber", ueber.has(el.dataset.key)); });
    const k = layer.querySelector(".kontext"); if (k) k.style.visibility = "hidden";
    chipZeigen(e, U.m(r.b) + " × " + U.m(r.t) + " m · X " + U.m(r.x) + " · Y " + U.m(r.y) + (ueber.has(zug.key) ? " · Überschneidung" : ""));
  }

  function hoch(e) {
    const z = zug; zug = null;
    if (!z) return;
    if (z.art === "zeichnen") {
      fx.innerHTML = ""; chip.hidden = true;
      if (!z.r || z.r.b < 2 || z.r.t < 2) { if (z.r) U.toast("Mindestgröße 2 × 2 m", "warn"); return; }
      S.ui.modus = "auswahl";
      render();
      platzierenDialog(z.r, { art: "neu" });
      return;
    }
    if (z.art === "tippen") {
      // Antippen: Fläche auswählen bzw. freie Fläche → Dialog
      if (!z.key) { if (S.ui.auswahl) { S.ui.auswahl = null; render(); } return; }
      const art = z.key[0], id = z.key.slice(2);
      S.ui.auswahl = { art: art, id: id };
      render();
      if (art === "f") { const f = rechteck(z.key); platzierenDialog(f, { art: "frei", id: id }); }
      return;
    }
    chip.hidden = true;
    if (!z.bewegt) { render(); return; }
    const o = z.o, r = z.r;
    if (o.x === r.x && o.y === r.y && o.b === r.b && o.t === r.t) { render(); return; }
    S.geometrieSetzen(z.key, r);       // speichern erst beim Loslassen
    if (S.ueberschneidungen().has(z.key)) U.toast("Achtung: Flächen überschneiden sich", "warn");
  }

  function abbruch() {
    zug = null; fx.innerHTML = ""; chip.hidden = true; render();
  }

  /** Fadenkreuz mit Koordinaten im Modus „Fläche aufziehen“. */
  function fadenkreuz(m) {
    if (!m || S.ui.modus !== "aufziehen") { fx.querySelectorAll(".kreuz").forEach(function (x) { x.remove(); }); if (!zug) chip.hidden = true; return; }
    const st = raster(), x = U.fang(m.x, st), y = U.fang(m.y, st);
    fx.querySelectorAll(".kreuz").forEach(function (k) { k.remove(); });
    fx.insertAdjacentHTML("afterbegin", '<line class="kreuz" x1="' + x + '" y1="0" x2="' + x + '" y2="' + H().tiefeM + '"/><line class="kreuz" x1="0" y1="' + y + '" x2="' + H().breiteM + '" y2="' + y + '"/>');
    if (!zug) {
      const b = stage.getBoundingClientRect();
      chipZeigen({ clientX: b.left + m.x / H().breiteM * b.width, clientY: b.top + m.y / H().tiefeM * b.height }, "X " + U.m(x) + " · Y " + U.m(y) + " m");
    }
  }

  /** Kleine Maß-/Koordinatenanzeige am Zeiger. */
  function chipZeigen(e, text) {
    const b = stage.getBoundingClientRect();
    chip.textContent = text; chip.hidden = false;
    let x = e.clientX - b.left + 16, y = e.clientY - b.top + 16;
    if (x + chip.offsetWidth > b.width) x = e.clientX - b.left - chip.offsetWidth - 12;
    if (y + chip.offsetHeight > b.height) y = e.clientY - b.top - chip.offsetHeight - 12;
    chip.style.left = x + "px"; chip.style.top = y + "px";
  }

  /** Klicks in der Kontextleiste. */
  function kontextKlick(e) {
    const b = e.target.closest("[data-kontext]"); if (!b) return;
    const a = S.ui.auswahl; if (!a) return;
    const k = b.dataset.kontext;
    if (k === "entfernen") S.ausPlanEntfernen(a.id);
    else if (k === "wechseln") platzierenDialog(S.projekt(a.id).flaeche, { art: "wechsel", projektId: a.id });
    else if (k === "platzieren") platzierenDialog(rechteck("f:" + a.id), { art: "frei", id: a.id });
    else if (k === "frei-weg") S.freieFlaecheEntfernen(a.id);
  }

  /* ===========================================================================
     Dialog „Projekt platzieren“
     ========================================================================= */

  /**
   * Zeigt die laufenden Nicht-Service-Projekte zur Auswahl.
   * @param {{x:number,y:number,b:number,t:number}} r Rechteck in Metern
   * @param {{art:"neu"}|{art:"frei", id:string}|{art:"wechsel", projektId:string}} quelle
   */
  function platzierenDialog(r, quelle) {
    const bereich = S.bereichVon(r);
    const liste = S.daten().projekte.filter(function (p) {
      return p.art !== "Service" && S.laeuft(p) && !(quelle.art === "wechsel" && p.id === quelle.projektId);
    }).sort(function (a, b) { return (a.flaeche ? 1 : 0) - (b.flaeche ? 1 : 0); });
    const box = U.el('<div class="plist"></div>');
    if (!liste.length) box.innerHTML = '<p class="dlg-text">Keine laufenden Projekte in dieser KW.</p>';
    let dlg = null;
    liste.forEach(function (p) {
      const zeile = U.el('<div class="pzeile"><span class="e-ico">' + U.icon(p.icon) + '</span><div class="e-tx"><b>' + U.esc(p.name) + "</b><span>" + U.esc(p.kunde + " · " + p.nummer) + "</span></div>" +
        (p.flaeche ? '<button type="button" class="btn">Hierher verschieben</button>' : '<span class="chip-np">' + U.icon("pin") + 'nicht im Plan</span><button type="button" class="btn pri">Platzieren</button>') + "</div>");
      zeile.querySelector("button").addEventListener("click", function () {
        dlg.schliessen(false);
        if (quelle.art === "wechsel") S.projektWechseln(quelle.projektId, p.id);
        else S.flaecheSetzen(p.id, r, quelle.art === "frei" ? quelle.id : null);
      });
      box.appendChild(zeile);
    });
    const knoepfe = quelle.art === "neu"
      ? [{ text: "Verwerfen" }, { text: "Als freie Fläche behalten", art: "pri", aktion: function () { S.freieFlaecheAnlegen(r); } }]
      : [{ text: "Abbrechen" }];
    dlg = U.dialog({
      titel: quelle.art === "wechsel" ? "Projekt wechseln" : "Projekt platzieren",
      untertitel: (bereich ? bereich.name : "Halle") + " · " + U.m(r.b) + " × " + U.m(r.t) + " m = " + U.m(r.b * r.t) + " m²",
      inhalt: box, knoepfe: knoepfe, breite: "40rem"
    });
  }

  /* ===========================================================================
     Befehle (Kopfzeile, Tastatur)
     ========================================================================= */

  /** Modus „auswahl“ oder „aufziehen“ setzen. */
  function modusSetzen(m) {
    S.ui.modus = m; if (m === "aufziehen") S.ui.auswahl = null;
    fx.innerHTML = ""; chip.hidden = true; render();
    if (m === "aufziehen") U.toast("Rechteck von Ecke zu Ecke aufziehen", "info");
  }

  /** Rasterfang umschalten. */
  function rasterUmschalten() { S.ui.raster = !S.ui.raster; render(); U.toast("Rasterfang " + (S.ui.raster ? "0,5 m an" : "aus"), "info"); }

  /** „Flächen leeren“ mit In-App-Bestätigung. */
  function leeren() {
    U.bestaetigen("Flächen leeren", "Alle Projekte werden aus dem Hallenplan genommen (Personen bleiben zugeordnet). Rückgängig ist möglich.", "Flächen leeren")
      .then(function (ja) { if (ja) S.flaechenLeeren(); });
  }

  /** Entf-Taste: ausgewählte Fläche aus dem Plan nehmen. */
  function auswahlEntfernen() {
    const a = S.ui.auswahl; if (!a) return;
    if (a.art === "p") S.ausPlanEntfernen(a.id); else S.freieFlaecheEntfernen(a.id);
  }

  return { init: init, render: render, groesse: groesse, modusSetzen: modusSetzen, rasterUmschalten: rasterUmschalten, leeren: leeren, auswahlEntfernen: auswahlEntfernen, platzierenDialog: platzierenDialog };
})();
