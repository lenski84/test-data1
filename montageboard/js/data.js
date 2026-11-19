/* =============================================================================
   data.js – Startdaten (Seed) und Schema-Version
   -----------------------------------------------------------------------------
   Alle Namen außer den ausdrücklich gewünschten Testpersonen sind fiktiv.
   Die Funktion Board.seed() liefert bei jedem Aufruf eine frische, tiefe Kopie,
   damit „Auf Startdaten zurücksetzen“ nie einen veränderten Stand übernimmt.
   ============================================================================= */
window.Board = window.Board || {};

/** Version des Datenformats. Wird beim Laden aus localStorage/Datei geprüft. */
Board.SCHEMA_VERSION = 2;

/**
 * Erzeugt den Startzustand des Boards.
 * @returns {object} vollständiger Datenstand (halle, abteilungen, projekte, personen, freieFlaechen)
 */
Board.seed = function () {
  const halle = {
    breiteM: 60,
    tiefeM: 40,
    bereiche: [ // Hintergrundflächen, nicht verschiebbar
      { id: "oben",  name: "Montagebereich oben",  x: 2, y: 2,  b: 56, t: 16 },
      { id: "unten", name: "Montagebereich unten", x: 2, y: 22, b: 56, t: 16 }
    ],
    hauptgang: { y: 18, t: 4, label: "Hauptgang" },
    tore: [{ name: "Tor 1", x: 0, y: 18 }]
  };

  const abteilungen = [
    { id: "SZA1", kuerzel: "SZA1", funktion: "Montage" },
    { id: "SZA2", kuerzel: "SZA2", funktion: "Inbetriebnahme" },
    { id: "SZA3", kuerzel: "SZA3", funktion: "Montage" },
    { id: "SZA4", kuerzel: "SZA4", funktion: "Inbetriebnahme" }
  ];

  // Drei Projekte zur besseren Übersicht: ein externes und ein internes – beide
  // werden direkt im Montagebereich bearbeitet (Fläche im Plan) – sowie ein
  // Service-Projekt beim Kunden (nie im Hallenplan).
  const projekte = [
    { id: "lucid", nummer: "P-24117", name: "Lucid Prüfstand",  kunde: "Lucid",   unterzeile: "E-Achsen-Prüfstand",
      art: "Extern",  startKW: 202646, endKW: 202652, status: "Verzug",  statusText: "+4 AT", soll: 2, abteilungId: "SZA1",
      icon: "bolt",  flaeche: { x: 5, y: 4,  b: 16, t: 12 } },
    { id: "sem",   nummer: "I-26003", name: "SEM Montagezelle", kunde: "SEM",     unterzeile: "Rotor-Fügezelle",
      art: "Intern",  startKW: 202646, endKW: 202650, status: "Im Plan", statusText: "", soll: 2, abteilungId: "SZA2",
      icon: "cell",  flaeche: { x: 5, y: 24, b: 14, t: 12 } },
    { id: "kundeA", nummer: "S-25031", name: "Kunde A Vor-Ort", kunde: "Kunde A", unterzeile: "Inbetriebnahme beim Kunden",
      art: "Service", startKW: 202647, endKW: 202649, status: "Im Plan", statusText: "", soll: 1, abteilungId: "SZA4",
      icon: "truck", flaeche: null }
  ];

  // Personen: [Name, Abteilung, Projekt|null, Anwesenheit, Vorarbeiter]
  // 3 anwesend (je auf einem Projekt), 1 im externen Service, 1 abwesend
  const roh = [
    ["Lennart Kleemann", "SZA1", "lucid",  "Anwesend", true],
    ["Hulk",             "SZA3", "lucid",  "Anwesend", false],
    ["Thor Odinson",     "SZA2", "sem",    "Anwesend", false],
    ["Hawkeye",          "SZA4", "kundeA", "Service",  false],
    ["Hannah Mör",       "SZA2", null,     "Abwesend", false]
  ];

  const personen = roh.map(function (r, i) {
    return {
      id: "p" + (i + 1),
      name: r[0],
      personalnr: "SMB-" + (1001 + i),
      abteilungId: r[1],
      projektId: r[2],
      anwesenheit: r[3],
      vorarbeiter: r[4],
      foto: null,
      fotoFreigabe: false
    };
  });

  return {
    schemaVersion: Board.SCHEMA_VERSION,
    halle: halle,
    abteilungen: abteilungen,
    projekte: projekte,
    personen: personen,
    freieFlaechen: [] // aufgezogene Flächen ohne Projekt: { id, x, y, b, t }
  };
};
