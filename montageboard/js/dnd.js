/* =============================================================================
   dnd.js – Ziehen der Personenkarten („Magnete“) mit Pointer Events
   -----------------------------------------------------------------------------
   Bewusst KEIN HTML5-Drag-and-Drop: das ist auf Touchscreens unzuverlässig.
   Ablauf:
     pointerdown auf [data-person] → Ziehen beginnt erst nach 150 ms Halten
     (Touch/Stift) oder 8 px Bewegung (Maus: 4 px). Bis dahin gilt es als Tippen.
     Während des Ziehens schwebt eine Kopie unter dem Finger; das Ziel wird mit
     document.elementFromPoint + [data-drop] ermittelt.
     Loslassen auf gültigem Ziel → Board.state.personAblegen(); sonst federt die
     Karte zurück. Antippen ohne Ziehen öffnet das Personen-Popover.
   ============================================================================= */
window.Board = window.Board || {};

Board.dnd = (function () {
  "use strict";
  const U = Board.util, S = Board.state;

  let z = null; // laufender Zug: { pid, quelle, pointerId, typ, x0, y0, dx, dy, aktiv, timer, geist, ziel }

  /** Einmalig beim Start: Ereignisse registrieren. */
  function init() {
    document.addEventListener("pointerdown", runter);
    window.addEventListener("pointermove", bewegen, { passive: false });
    window.addEventListener("pointerup", hoch);
    window.addEventListener("pointercancel", abbrechen);
    document.addEventListener("click", zuordnenKlick, true);
  }

  /** Zeiger auf einer Personenkarte gedrückt. */
  function runter(e) {
    if (e.button > 0 || z) return;
    const k = e.target.closest("[data-person]");
    if (!k || k.closest("#popover") || k.closest(".geist")) return;
    if (S.ui.zuordnen) return;                 // im Zuordnen-Modus zählt nur das Ziel
    const r = k.getBoundingClientRect();
    z = { pid: k.dataset.person, quelle: k, pointerId: e.pointerId, typ: e.pointerType,
          x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top,
          aktiv: false, timer: null, geist: null, ziel: null };
    if (e.pointerType !== "mouse") {
      // Touch/Stift: nach 150 ms Halten startet das Ziehen
      z.timer = setTimeout(function () { if (z && !z.aktiv) starten(z.x0, z.y0); }, 150);
    }
  }

  /** Zeigerbewegung: Schwelle prüfen bzw. Geist und Ziel nachführen. */
  function bewegen(e) {
    if (!z || e.pointerId !== z.pointerId) return;
    if (!z.aktiv) {
      const dist = Math.hypot(e.clientX - z.x0, e.clientY - z.y0);
      if (dist < (z.typ === "mouse" ? 4 : 8)) return;
      starten(e.clientX, e.clientY);
    }
    e.preventDefault();
    z.geist.style.transform = "translate(" + (e.clientX - z.dx) + "px," + (e.clientY - z.dy) + "px) scale(1.05)";
    zielSetzen(e.clientX, e.clientY);
  }

  /**
   * Startet das eigentliche Ziehen: schwebende Kopie erzeugen, Original
   * halbtransparent, gültige Ziele markieren.
   */
  function starten(x, y) {
    clearTimeout(z.timer);
    z.aktiv = true;
    Board.render.popoverSchliessen();
    const r = z.quelle.getBoundingClientRect();
    const g = z.quelle.cloneNode(true);
    g.classList.add("geist");
    g.style.width = r.width + "px"; g.style.height = r.height + "px";
    g.style.transform = "translate(" + (x - z.dx) + "px," + (y - z.dy) + "px) scale(1.05)";
    document.getElementById("dndLayer").appendChild(g);
    z.geist = g;
    z.quelle.classList.add("quelle");
    try { z.quelle.setPointerCapture(z.pointerId); } catch (err) { /* nicht kritisch */ }
    const p = S.person(z.pid);
    document.body.classList.add("zieht");
    document.querySelectorAll("[data-drop]").forEach(function (d) {
      if (d.dataset.drop === "projekt" || d.dataset.abt === p.abteilungId) d.classList.add("ziel-ok");
    });
    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (err) { /* egal */ } }
  }

  /** Ermittelt das Ablageziel unter dem Zeiger und hebt es hervor. */
  function zielSetzen(x, y) {
    const el = document.elementFromPoint(x, y);
    const t = el ? el.closest("[data-drop]") : null;
    if (z.ziel && z.ziel !== t) z.ziel.classList.remove("ziel-hover");
    z.ziel = t;
    if (t) t.classList.add("ziel-hover");
  }

  /** Zeiger losgelassen: Tippen → Popover, Ziehen → ablegen oder zurückfedern. */
  function hoch(e) {
    if (!z || e.pointerId !== z.pointerId) return;
    const zug = z; clearTimeout(zug.timer);
    if (!zug.aktiv) {
      z = null;
      Board.render.popoverOeffnen(zug.pid, zug.quelle.getBoundingClientRect());
      return;
    }
    zielSetzen(e.clientX, e.clientY);
    const t = zug.ziel;
    let erg = { ok: false };
    if (t) erg = ablegen(zug.pid, t);
    if (erg.ok) { aufraeumen(); return; }
    if (erg.meldung) U.toast(erg.meldung, "warn");
    zurueckfedern();
  }

  /** Abbruch durch das System (z. B. Geste): zurückfedern. */
  function abbrechen(e) {
    if (!z || e.pointerId !== z.pointerId) return;
    clearTimeout(z.timer);
    if (z.aktiv) zurueckfedern(); else z = null;
  }

  /**
   * Übersetzt ein DOM-Ziel in ein Ablageziel und ruft die Aktion auf.
   * @param {string} pid Person
   * @param {HTMLElement} t Element mit data-drop
   * @returns {{ok:boolean, meldung?:string}}
   */
  function ablegen(pid, t) {
    if (t.dataset.drop === "projekt") return S.personAblegen(pid, { typ: "projekt", projektId: t.dataset.projekt });
    if (t.dataset.drop === "abteilung") return S.personAblegen(pid, { typ: "abteilung", abteilungId: t.dataset.abt, spalte: t.dataset.spalte });
    return { ok: false };
  }

  /** Animation zurück zur Ausgangsposition (200 ms), danach aufräumen. */
  function zurueckfedern() {
    const zug = z; if (!zug || !zug.geist) { aufraeumen(); return; }
    const r = zug.quelle.getBoundingClientRect();
    zug.geist.style.transition = "transform 200ms ease-out, opacity 200ms";
    zug.geist.style.transform = "translate(" + r.left + "px," + r.top + "px) scale(1)";
    setTimeout(aufraeumen, 210);
  }

  /** Entfernt Geist und Markierungen. */
  function aufraeumen() {
    if (z && z.geist) z.geist.remove();
    if (z && z.quelle) z.quelle.classList.remove("quelle");
    document.body.classList.remove("zieht");
    document.querySelectorAll(".ziel-ok,.ziel-hover").forEach(function (d) { d.classList.remove("ziel-ok", "ziel-hover"); });
    z = null;
  }

  /**
   * Barrierefreie Alternative: Nach „Zuordnen …“ im Popover wird das nächste
   * angetippte Ziel verwendet.
   */
  function zuordnenKlick(e) {
    const pid = S.ui.zuordnen; if (!pid) return;
    const t = e.target.closest("[data-drop]");
    if (!t) return;
    e.stopPropagation(); e.preventDefault();
    S.ui.zuordnen = null;
    const erg = ablegen(pid, t);
    if (!erg.ok && erg.meldung) U.toast(erg.meldung, "warn");
    Board.render.alles();
  }

  /** Bricht den Zuordnen-Modus ab (Esc). */
  function zuordnenAbbrechen() { if (S.ui.zuordnen) { S.ui.zuordnen = null; Board.render.alles(); U.toast("Zuordnen abgebrochen", "info"); } }

  return { init: init, zuordnenAbbrechen: zuordnenAbbrechen };
})();
