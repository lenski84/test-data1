/* =============================================================================
   ordner.js – Verbindung mit dem OneDrive-Ordner „data“ (Weg 2)
   -----------------------------------------------------------------------------
   Im Ordner liegen zwei Dateien mit je GENAU EINEM Schreiber:
     stammdaten.json  ← schreibt nur der Flow (SharePoint-Listen → Board).
     board-state.json ← schreibt nur das Board. Zustand + Änderungsprotokoll
                        changes[] mit laufender Nummer seq.
   Zusammenführen beim Laden: Stammfelder aus stammdaten.json, Zustandsfelder
   aus board-state.json. Neue Personen/Projekte aus der Liste bekommen ihren
   Startwert aus der Liste. Das Protokoll entsteht automatisch durch Vergleich
   des Zustands vor/nach jeder Änderung (auch Rückgängig).
   ============================================================================= */
window.Board = window.Board || {};

Board.ordner = (function () {
  "use strict";
  const U = Board.util, S = Board.state;
  const STAMM = "stammdaten.json", ZUSTAND = "board-state.json";
  const PROTOKOLL_KEY = "montageboard.protokoll";
  const MAX_CHANGES = 500;
  const PRUEF_MS = 20000;
  const ANWESENHEIT = ["Anwesend", "Abwesend", "Service", "Dienstreise", "Schulung"];
  const ARTEN = ["Extern", "Intern", "Service"];
  const ICONS = ["gear", "bolt", "cell", "bearing", "laser", "chip", "school", "truck", "wrench", "box"];
  const STATUS = { "im plan": "Im Plan", "im zeitplan": "Im Plan", "verzug": "Verzug", "prognose": "Prognose", "abgeschlossen": "Abgeschlossen" };

  const o = {
    verfuegbar: typeof window.showDirectoryPicker === "function",
    handle: null, aktiv: false, wartet: false, offen: false,
    zuletztStamm: 0, zuletztZustand: 0, letzter: null, timer: null
  };
  let protokoll = protokollLaden();

  /* ---------- Protokoll (lokal gesichert, seq zählt nach Neustart weiter) ---------- */
  function protokollLaden() {
    try {
      const p = JSON.parse(localStorage.getItem(PROTOKOLL_KEY));
      if (p && typeof p.seq === "number" && Array.isArray(p.changes)) return p;
    } catch (e) { /* kaputt → neu */ }
    return { seq: 0, changes: [] };
  }
  function protokollSpeichern() {
    try { localStorage.setItem(PROTOKOLL_KEY, JSON.stringify(protokoll)); } catch (e) { /* nicht kritisch */ }
  }

  /* ---------- Zustand: Auszug, Vergleich ---------- */
  /** Zieht die Zustandsfelder (Zuordnung, Anwesenheit, Vorarbeiter, Flächen) aus dem Datenstand. */
  function zustandAus(d) {
    const personen = {}, flaechen = {};
    d.personen.forEach(function (p) {
      personen[p.id] = { projektId: p.projektId || null, anwesenheit: p.anwesenheit, vorarbeiter: !!p.vorarbeiter };
    });
    d.projekte.forEach(function (p) {
      if (p.art === "Service") return;
      flaechen[p.id] = p.flaeche ? { x: p.flaeche.x, y: p.flaeche.y, b: p.flaeche.b, t: p.flaeche.t } : null;
    });
    return { personen: personen, flaechen: flaechen, freieFlaechen: JSON.parse(JSON.stringify(d.freieFlaechen || [])) };
  }
  function gleich(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /** Änderungen zwischen zwei Zuständen; nur Einträge, die in beiden vorkommen. */
  function vergleichen(alt, neu) {
    const l = [];
    Object.keys(neu.personen).forEach(function (id) {
      const a = alt.personen[id], n = neu.personen[id];
      if (a && !gleich(a, n)) l.push({ typ: "person", personId: id, vorher: a, nachher: n });
    });
    Object.keys(neu.flaechen).forEach(function (id) {
      if (!(id in alt.flaechen)) return;
      const a = alt.flaechen[id], n = neu.flaechen[id];
      if (!gleich(a, n)) l.push({ typ: "flaeche", projektId: id, vorher: a, nachher: n });
    });
    return l;
  }

  /** Von Board.state.speichern() nach jeder Änderung aufgerufen. true = Ordner übernimmt das Speichern. */
  function nachAenderung(d) {
    if (!o.aktiv) return false;
    const neu = zustandAus(d);
    const jetzt = new Date().toISOString();
    vergleichen(o.letzter, neu).forEach(function (c) {
      protokoll.seq += 1;
      protokoll.changes.push(Object.assign({ seq: protokoll.seq, ts: jetzt }, c));
    });
    if (protokoll.changes.length > MAX_CHANGES) protokoll.changes = protokoll.changes.slice(-MAX_CHANGES);
    protokollSpeichern();
    o.letzter = neu;
    o.offen = true;
    S.syncSetzen("speichert", "Speichere in " + ZUSTAND + " …");
    planen();
    return true;
  }

  /* ---------- Dateizugriff ---------- */
  async function lesen(name) {
    let fh;
    try { fh = await o.handle.getFileHandle(name); }
    catch (e) { if (e && e.name === "NotFoundError") return null; throw e; }
    const f = await fh.getFile();
    return { text: await f.text(), lastModified: f.lastModified };
  }
  async function geaendertAm(name) {
    try { const fh = await o.handle.getFileHandle(name); return (await fh.getFile()).lastModified; }
    catch (e) { return 0; }
  }
  /** Schreibt board-state.json mit Zustand und Protokoll. */
  async function schreiben() {
    if (!o.aktiv || !o.handle) return;
    const z = o.letzter || zustandAus(S.daten());
    const inhalt = { version: 1, geaendert: new Date().toISOString(), seq: protokoll.seq,
      personen: z.personen, flaechen: z.flaechen, freieFlaechen: z.freieFlaechen, changes: protokoll.changes };
    try {
      const fh = await o.handle.getFileHandle(ZUSTAND, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify(inhalt, null, 1));
      await w.close();
      o.zuletztZustand = (await fh.getFile()).lastModified;
      o.offen = false;
      S.syncSetzen("ok", "Gespeichert in " + o.handle.name + "/" + ZUSTAND + " (seq " + protokoll.seq + ")");
    } catch (e) {
      S.syncSetzen("fehler", "Schreiben in " + ZUSTAND + " fehlgeschlagen – Stand liegt im Browser");
      U.toast("Speichern im Ordner fehlgeschlagen – der Stand bleibt im Browser gesichert", "error");
    }
  }
  const planen = U.entprellen(schreiben, 1000);

  /* ---------- Stammdaten normalisieren & zusammenführen ---------- */
  function sid(v) {
    if (v == null || v === "") return null;
    if (typeof v === "object") v = v.Id != null ? v.Id : v.id;
    return v == null ? null : String(v);
  }
  /** KW als JJJJWW; reine Wochennummern (z. B. 46) → laufendes Jahr. */
  function kw(v) {
    const n = parseInt(v, 10);
    if (!n) return null;
    if (n < 100) return Math.floor(U.aktuelleKw() / 100) * 100 + n;
    return n;
  }
  function zahl(v) { const n = parseFloat(String(v).replace(",", ".")); return isFinite(n) ? n : null; }
  function flaeche(f) {
    if (!f) return null;
    const r = { x: zahl(f.x), y: zahl(f.y), b: zahl(f.b), t: zahl(f.t) };
    return r.x != null && r.y != null && r.b > 0 && r.t > 0 ? r : null;
  }
  function wahl(v) { return v && typeof v === "object" ? (v.Value != null ? v.Value : "") : (v == null ? "" : String(v)); }

  /** Bringt stammdaten.json in das Format der App (IDs als Text). */
  function normalisieren(s) {
    const w = [];
    const abteilungen = (s.abteilungen || []).map(function (a) {
      return { id: sid(a.id), kuerzel: String(a.kuerzel || a.Title || a.id), funktion: wahl(a.funktion) || "Montage" };
    }).filter(function (a) { return a.id; });
    const abtIds = new Set(abteilungen.map(function (a) { return a.id; }));
    const projekte = (s.projekte || []).map(function (p) {
      const art = ARTEN.indexOf(wahl(p.art)) >= 0 ? wahl(p.art) : "Extern";
      const status = STATUS[wahl(p.status).trim().toLowerCase()] || "Im Plan";
      const start = kw(p.startKW), ende = kw(p.endKW);
      const icon = ICONS.indexOf(wahl(p.icon)) >= 0 ? wahl(p.icon) : (art === "Service" ? "truck" : "box");
      return {
        id: sid(p.id), nummer: String(p.nummer || ""), name: String(p.name || "(ohne Namen)"), kunde: String(p.kunde || ""),
        unterzeile: String(p.unterzeile || ""), art: art, startKW: start || 0, endKW: ende || start || 0,
        status: status, statusText: String(p.statusText || ""), soll: Math.max(0, parseInt(p.soll, 10) || 0),
        abteilungId: sid(p.abteilungId), icon: icon, flaeche: art === "Service" ? null : flaeche(p.flaeche)
      };
    }).filter(function (p) {
      if (!p.id) return false;
      if (!p.startKW) w.push("Projekt „" + p.name + "“ ohne Start-KW");
      return true;
    });
    const prIds = new Set(projekte.map(function (p) { return p.id; }));
    const personen = (s.personen || []).map(function (p) {
      const anw = ANWESENHEIT.indexOf(wahl(p.anwesenheit)) >= 0 ? wahl(p.anwesenheit) : "Anwesend";
      const pid = sid(p.projektId);
      return {
        id: sid(p.id), name: String(p.name || "?"), personalnr: "", abteilungId: sid(p.abteilungId),
        projektId: pid && prIds.has(pid) ? pid : null, anwesenheit: anw,
        vorarbeiter: !!p.vorarbeiter, foto: null, fotoFreigabe: !!p.fotoFreigabe
      };
    }).filter(function (p) {
      if (!p.id) return false;
      if (!abtIds.has(p.abteilungId)) { w.push(p.name + " hat keine gültige Abteilung – nicht angezeigt"); return false; }
      return true;
    });
    return { abteilungen: abteilungen, projekte: projekte, personen: personen, warnungen: w };
  }

  /** Stammdaten + Board-Zustand → vollständiger Datenstand. */
  function zusammenfuehren(stamm, z, alt) {
    const fotos = {};
    (alt && alt.personen || []).forEach(function (p) { if (p.foto) fotos[p.id] = p.foto; });
    const prIds = new Set(stamm.projekte.map(function (p) { return p.id; }));
    const hat = function (obj, k) { return !!obj && Object.prototype.hasOwnProperty.call(obj, k); };
    const projekte = stamm.projekte.map(function (p) {
      const f = hat(z && z.flaechen, p.id) ? flaeche(z.flaechen[p.id]) : p.flaeche;
      return Object.assign({}, p, { flaeche: p.art === "Service" ? null : f });
    });
    const personen = stamm.personen.map(function (p) {
      const s = hat(z && z.personen, p.id) ? z.personen[p.id] : null;
      const n = Object.assign({}, p);
      if (s) {
        n.projektId = s.projektId && prIds.has(String(s.projektId)) ? String(s.projektId) : null;
        n.anwesenheit = ANWESENHEIT.indexOf(s.anwesenheit) >= 0 ? s.anwesenheit : p.anwesenheit;
        n.vorarbeiter = !!s.vorarbeiter;
      }
      if (fotos[p.id] && n.fotoFreigabe) n.foto = fotos[p.id];
      return n;
    });
    return {
      schemaVersion: Board.SCHEMA_VERSION,
      halle: (alt && alt.halle) || Board.seed().halle,
      abteilungen: stamm.abteilungen, projekte: projekte, personen: personen,
      freieFlaechen: z && Array.isArray(z.freieFlaechen) ? z.freieFlaechen : ((alt && alt.freieFlaechen) || [])
    };
  }

  /* ---------- Laden aus dem Ordner ---------- */
  async function laden(text) {
    let st, zs;
    try { st = await lesen(STAMM); zs = await lesen(ZUSTAND); }
    catch (e) { S.syncSetzen("fehler", "Ordner nicht lesbar"); U.toast("Ordner nicht lesbar (" + (e && e.name) + ")", "error"); return false; }
    if (!st) { U.toast(STAMM + " fehlt im gewählten Ordner – bitte den Ordner „data“ wählen", "error"); return false; }
    let stamm, z = null;
    try { stamm = normalisieren(JSON.parse(st.text)); }
    catch (e) { U.toast(STAMM + " ist kein gültiges JSON", "error"); return false; }
    if (zs && zs.text.trim()) {
      try { z = JSON.parse(zs.text); } catch (e) { U.toast(ZUSTAND + " ist beschädigt – Startwerte aus den Listen werden verwendet", "warn"); }
    }
    if (!stamm.abteilungen.length) { U.toast(STAMM + " enthält keine Abteilungen", "error"); return false; }
    const d = zusammenfuehren(stamm, z, S.daten());
    if (z && typeof z.seq === "number" && z.seq >= protokoll.seq) {
      protokoll = { seq: z.seq, changes: Array.isArray(z.changes) ? z.changes.slice(-MAX_CHANGES) : [] };
      protokollSpeichern();
    }
    o.zuletztStamm = st.lastModified;
    o.zuletztZustand = zs ? zs.lastModified : 0;
    o.letzter = zustandAus(d);
    S.datenSetzen(d);
    if (!z) await schreiben();
    else S.syncSetzen("ok", "Verbunden mit " + o.handle.name + " (seq " + protokoll.seq + ")");
    stamm.warnungen.slice(0, 3).forEach(function (t) { U.toast(t, "warn"); });
    if (text) U.toast(text, "ok");
    return true;
  }
  /** Alle 20 s: hat der Flow (stammdaten) oder ein anderer Rechner (board-state) geändert? */
  async function pruefen() {
    if (!o.aktiv || o.offen || document.body.classList.contains("zieht")) return;
    const ts = await geaendertAm(STAMM), tz = await geaendertAm(ZUSTAND);
    if (ts > o.zuletztStamm + 500) await laden("Stammdaten aktualisiert");
    else if (tz > o.zuletztZustand + 500) await laden("Stand aktualisiert (von anderem Rechner)");
  }

  /* ---------- Verbinden / Trennen ---------- */
  function idb(modus, fn) {
    return new Promise(function (resolve, reject) {
      let req;
      try { req = indexedDB.open("montageboard-ordner", 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore("kv"); };
      req.onerror = function () { reject(req.error); };
      req.onsuccess = function () {
        try {
          const tx = req.result.transaction("kv", modus);
          const r = fn(tx.objectStore("kv"));
          tx.oncomplete = function () { resolve(r && r.result); };
          tx.onerror = function () { reject(tx.error); };
        } catch (e) { reject(e); }
      };
    });
  }
  async function starten(h) {
    o.handle = h; o.aktiv = true; o.wartet = false;
    const ok = await laden("Verbunden mit Ordner „" + h.name + "“");
    if (!ok) { o.aktiv = false; S.syncSetzen("fehler", "Ordner ungültig"); Board.render.alles(); return; }
    try { await idb("readwrite", function (s) { return s.put(h, "ordner"); }); } catch (e) { /* optional */ }
    clearInterval(o.timer);
    o.timer = setInterval(pruefen, PRUEF_MS);
    Board.render.alles();
  }
  async function verbinden() {
    try {
      const h = await window.showDirectoryPicker({ id: "montageboard", mode: "readwrite" });
      await starten(h);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      U.toast("Ordner konnte nicht verbunden werden (" + (e && e.name || "Fehler") + ")", "error");
    }
  }
  async function beimStart() {
    if (!o.verfuegbar) return;
    try {
      const h = await idb("readonly", function (s) { return s.get("ordner"); });
      if (!h) return;
      o.handle = h;
      if (h.queryPermission && (await h.queryPermission({ mode: "readwrite" })) === "granted") { await starten(h); return; }
      o.wartet = true;
      S.syncSetzen("speichert", "Ordner getrennt – zum Verbinden antippen");
      Board.render.alles();
    } catch (e) { /* IndexedDB unter file:// evtl. gesperrt */ }
  }
  async function wiederherstellen() {
    if (!o.handle) { verbinden(); return; }
    try {
      const perm = await o.handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") { U.toast("Berechtigung nicht erteilt – Stand bleibt im Browser", "warn"); return; }
      await starten(o.handle);
    } catch (e) { U.toast("Wiederherstellen fehlgeschlagen – bitte Ordner neu wählen", "error"); verbinden(); }
  }
  async function trennen() {
    o.aktiv = false; o.wartet = false; o.handle = null; clearInterval(o.timer);
    try { await idb("readwrite", function (s) { return s.delete("ordner"); }); } catch (e) { /* egal */ }
    S.syncSetzen("ok", "Im Browser gespeichert");
    Board.render.alles();
    U.toast("Ordnerverbindung getrennt", "info");
  }
  function neuLaden() { if (o.aktiv && !o.offen) laden("Neu geladen"); else if (o.offen) U.toast("Es wird gerade gespeichert – gleich noch einmal versuchen", "info"); }

  return {
    verfuegbar: function () { return o.verfuegbar; },
    aktiv: function () { return o.aktiv; },
    wartet: function () { return o.wartet; },
    name: function () { return o.handle ? o.handle.name : ""; },
    verbinden: verbinden, wiederherstellen: wiederherstellen, trennen: trennen,
    beimStart: beimStart, neuLaden: neuLaden, nachAenderung: nachAenderung,
    intern: { zustandAus: zustandAus, vergleichen: vergleichen, normalisieren: normalisieren, zusammenfuehren: zusammenfuehren, protokoll: function () { return protokoll; }, pruefen: pruefen }
  };
})();
