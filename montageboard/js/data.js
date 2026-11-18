/* =============================================================================
   data.js – Startdaten (Seed) und Schema-Version
   -----------------------------------------------------------------------------
   Alle Namen außer den ausdrücklich gewünschten Testpersonen sind fiktiv.
   Die Funktion Board.seed() liefert bei jedem Aufruf eine frische, tiefe Kopie,
   damit „Auf Startdaten zurücksetzen“ nie einen veränderten Stand übernimmt.
   ============================================================================= */
window.Board = window.Board || {};

/** Version des Datenformats. Wird beim Laden aus localStorage/Datei geprüft. */
Board.SCHEMA_VERSION = 1;

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
    { id: "SZA1",    kuerzel: "SZA1",    funktion: "Montage" },
    { id: "SZA2",    kuerzel: "SZA2",    funktion: "Inbetriebnahme" },
    { id: "SZA3",    kuerzel: "SZA3",    funktion: "Montage" },
    { id: "SZA4",    kuerzel: "SZA4",    funktion: "Inbetriebnahme" },
    { id: "ZSAA",    kuerzel: "ZSAA",    funktion: "Montage" },
    { id: "ZSYZSC",  kuerzel: "ZSY/ZSC", funktion: "Inbetriebnahme" }
  ];

  // Projekte: 5 mit Fläche im Plan, 2 ohne Fläche, 2 Service (nie im Hallenplan)
  const projekte = [
    { id: "sew",   nummer: "P-24101", name: "SEW Linie 3",        kunde: "SEW Eurodrive",   unterzeile: "Montagelinie Getriebe",
      art: "Extern",  startKW: 202645, endKW: 202646, status: "Im Plan",  statusText: "", soll: 4, abteilungId: "SZA3",
      icon: "gear",    flaeche: { x: 4,  y: 4,  b: 14, t: 12 } },
    { id: "lucid", nummer: "P-24117", name: "Lucid Prüfstand",    kunde: "Lucid",           unterzeile: "E-Achsen-Prüfstand",
      art: "Extern",  startKW: 202646, endKW: 202652, status: "Verzug",   statusText: "+4 AT", soll: 5, abteilungId: "SZA1",
      icon: "bolt",    flaeche: { x: 20, y: 4,  b: 14, t: 11 } },
    { id: "sem",   nummer: "I-26003", name: "SEM Montagezelle",   kunde: "SEM",             unterzeile: "Rotor-Fügezelle",
      art: "Intern",  startKW: 202646, endKW: 202650, status: "Im Plan",  statusText: "", soll: 4, abteilungId: "SZA2",
      icon: "cell",    flaeche: { x: 36, y: 4,  b: 10, t: 10 } },
    { id: "radl",  nummer: "P-24121", name: "Radlager-Linie",     kunde: "Antrieb Nord",    unterzeile: "Wälzlager-Montage",
      art: "Extern",  startKW: 202644, endKW: 202702, status: "Prognose", statusText: "+3 AT", soll: 6, abteilungId: "ZSAA",
      icon: "bearing", flaeche: { x: 4,  y: 24, b: 16, t: 12 } },
    { id: "laser", nummer: "P-24126", name: "Laserschweißzelle",  kunde: "Energie Süd",     unterzeile: "Schweißzelle Statoren",
      art: "Extern",  startKW: 202647, endKW: 202651, status: "Im Plan",  statusText: "", soll: 3, abteilungId: "SZA3",
      icon: "laser",   flaeche: { x: 24, y: 24, b: 12, t: 10 } },
    { id: "wafer", nummer: "P-24130", name: "Wafer-Handling",     kunde: "Halbleiter West", unterzeile: "Reinraum-Handling",
      art: "Extern",  startKW: 202647, endKW: 202705, status: "Prognose", statusText: "+2 AT", soll: 4, abteilungId: "SZA1",
      icon: "chip",    flaeche: null },
    { id: "azubi", nummer: "I-26007", name: "Azubi Linearachse",  kunde: "SMB intern",      unterzeile: "Ausbildungsprojekt",
      art: "Intern",  startKW: 202641, endKW: 202704, status: "Im Plan",  statusText: "", soll: 3, abteilungId: "ZSAA",
      icon: "school",  flaeche: null },
    { id: "kundeA", nummer: "S-25031", name: "Kunde A Vor-Ort",   kunde: "Kunde A",         unterzeile: "Inbetriebnahme beim Kunden",
      art: "Service", startKW: 202647, endKW: 202649, status: "Im Plan",  statusText: "", soll: 2, abteilungId: "SZA4",
      icon: "truck",   flaeche: null },
    { id: "kundeB", nummer: "S-25034", name: "Kunde B Getriebeprüfung", kunde: "Kunde B",   unterzeile: "SAT beim Kunden",
      art: "Service", startKW: 202647, endKW: 202650, status: "Prognose", statusText: "+1 AT", soll: 1, abteilungId: "ZSYZSC",
      icon: "wrench",  flaeche: null }
  ];

  // Personen: [Name, Abteilung, Projekt|null, Anwesenheit, Vorarbeiter]
  const roh = [
    ["Lennart Kleemann", "SZA1", "lucid",  "Anwesend", false],
    ["Jonas Weber",      "SZA1", "lucid",  "Anwesend", true],
    ["Mia Schuster",     "SZA1", "lucid",  "Anwesend", false],
    ["Felix Brandt",     "SZA1", "wafer",  "Anwesend", false],
    ["Sara Yilmaz",      "SZA1", null,     "Anwesend", false],
    ["Tim Hoffmann",     "SZA1", null,     "Abwesend", false],

    ["Thor Odinson",     "SZA2", "sem",    "Anwesend", false],
    ["Hannah Mör",       "SZA2", null,     "Schulung", false],
    ["Lukas Becker",     "SZA2", "sem",    "Anwesend", true],
    ["Elena Kraus",      "SZA2", "sem",    "Anwesend", false],
    ["David Roth",       "SZA2", null,     "Anwesend", false],
    ["Nina Vogel",       "SZA2", null,     "Dienstreise", false],

    ["Hulk",             "SZA3", "sew",    "Anwesend", false],
    ["Paul Richter",     "SZA3", "sew",    "Anwesend", true],
    ["Tobias Lange",     "SZA3", "sew",    "Anwesend", false],
    ["Lea Wolf",         "SZA3", "laser",  "Anwesend", false],
    ["Max Klein",        "SZA3", "laser",  "Anwesend", false],
    ["Jan Horn",         "SZA3", null,     "Abwesend", false],

    ["Hawkeye",          "SZA4", "kundeA", "Service",  false],
    ["Clara Neumann",    "SZA4", "kundeA", "Service",  true],
    ["Moritz Engel",     "SZA4", "lucid",  "Anwesend", false],
    ["Ben Schmitt",      "SZA4", null,     "Anwesend", false],
    ["Julia Fuchs",      "SZA4", null,     "Dienstreise", false],
    ["Oliver Peters",    "SZA4", "laser",  "Anwesend", false],

    ["Simon Keller",     "ZSAA", "radl",   "Anwesend", true],
    ["Anna Berg",        "ZSAA", "radl",   "Anwesend", false],
    ["Erik Sommer",      "ZSAA", "radl",   "Anwesend", false],
    ["Laura Pohl",       "ZSAA", "azubi",  "Anwesend", false],
    ["Noah Graf",        "ZSAA", "azubi",  "Anwesend", false],
    ["Emma Seidel",      "ZSAA", null,     "Schulung", false],

    ["Kai Lorenz",       "ZSYZSC", "kundeB", "Service",  true],
    ["Sophie Haas",      "ZSYZSC", "radl",   "Anwesend", false],
    ["Luis Frank",       "ZSYZSC", "wafer",  "Anwesend", false],
    ["Milan Otto",       "ZSYZSC", null,     "Anwesend", false],
    ["Ida Busch",        "ZSYZSC", null,     "Abwesend", false]
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
