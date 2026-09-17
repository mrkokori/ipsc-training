// Automatische Tests der IPSC Trainings-Bibliothek.
// Lokal ausführen: npm install && npm test
// Auf GitHub laufen sie bei jedem Commit automatisch (siehe .github/workflows/tests.yml).

const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0, failed = 0;
function ok(condition, message) {
  if (condition) { passed++; console.log("  ✓ " + message); }
  else { failed++; console.log("  ✗ " + message); }
}
function section(title) { console.log("\n" + title); }

const HTML = read("index.html").replace(/<script[\s\S]*?<\/script>/g, "");

function boot({ builtins = true, storage = {}, hash = "", beforeApp } = {}) {
  const dom = new JSDOM(HTML, {
    url: "https://mrkokori.github.io/ipsc-training/index.html" + hash,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const w = dom.window;
  Object.assign(w, { TextEncoder, TextDecoder, CompressionStream, DecompressionStream });
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.alert = (m) => { w.lastAlert = m; };
  w.confirm = (m) => { w.lastConfirm = m; return w.confirmAnswer !== false; };
  w.prompt = () => w.promptAnswer;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, JSON.stringify(v));
  if (beforeApp) beforeApp(w);
  w.eval(builtins ? read("data/drills.js") : "window.IPSC_DRILLS = [];");
  w.eval(read("lib/qrcode.js"));
  w.eval(read("app.js") + "\n;window.__t = (x) => eval(x);");
  return { w, E: (x) => w.__t(x), $: (s) => w.document.querySelector(s), $$: (s) => [...w.document.querySelectorAll(s)] };
}

const goodDrill = {
  id: "custom-1", custom: true, title: "Übergänge & Reloads", category: "Transitions", procedure: "Ablauf", rounds: 6,
  layout: { viewW: 400, viewH: 500, targets: [{ type: "paper", x: 100, y: 100, label: "T1" }], shooterPositions: [], walls: [], boxes: [], props: [], path: [] }
};
const evilValue = '0"/><img src=x onerror="window.pwned=1"><x a="';
const evilDrill = {
  id: "custom-evil", custom: true, title: "Böse <b>Übung</b>", category: "Test", procedure: "x",
  rounds: '<img src=x onerror="window.pwned=2">', sketchDataUrl: 'x" onerror="window.pwned=3',
  layout: { targets: [{ type: "paper", x: evilValue, y: 10, label: "<script>" }], walls: [{ x1: evilValue, y1: 1, x2: 2, y2: 3 }],
    shooterPositions: [{ x: 1, y: 2, facing: evilValue, label: "S" }], props: [{ type: "tisch", x: evilValue, y: 1 }] }
};

async function testScoringAndSecurity() {
  section("Wertung, Datenprüfung, Import");
  const { w, E, $ } = boot({
    builtins: false,
    storage: {
      ipscCustomDrills: [goodDrill, evilDrill],
      ipscScoreLogs: { "custom-1": [{ date: "2026-09-01T10:00:00.000Z", alpha: 10, charlie: 2, delta: 0, mike: 1, noshoot: 0, time: 4, major: false, points: 56, hitFactor: 14 }] }
    }
  });
  ok(E("calcIpscPoints")(10, 2, 0, 0, 0, 0, false) === 56, "10A 2C Minor = 56 Punkte");
  ok(E("calcIpscPoints")(10, 2, 0, 1, 1, 1, true) === 28, "Major mit Miss, No-Shoot, Procedural = 28 Punkte");
  ok(E("calcIpscPoints")(1, 0, 0, 3, 0, 0, false) === 0, "Ergebnis nie negativ");
  const stored = JSON.parse(w.localStorage.getItem("ipscScoreLogs"));
  ok(stored["custom-1"][0].points === 46 && stored["custom-1"][0].hitFactor === 11.5, "alte Einträge werden neu berechnet");

  const evil = E("DRILLS").find((d) => d.id === "custom-evil");
  E("openDetail")(evil);
  ok(!$("[onerror]") && w.pwned === undefined, "manipulierte gespeicherte Daten führen keinen Code aus");
  E("closeDetail")();

  const payload = { type: "ipsc-training-export", customDrills: E("customDrills"), editedBuiltins: {}, deletedBuiltinIds: ["x"], scoreLogs: E("scoreLogs") };
  const n = E("customDrills").length, s = E("scoreLogs")["custom-1"].length;
  for (let i = 0; i < 2; i++) { E("importFile")(new w.File([JSON.stringify(payload)], "e.json")); await sleep(50); }
  ok(E("customDrills").length === n && E("scoreLogs")["custom-1"].length === s, "doppelter Import erzeugt keine Duplikate");
  ok(E("deletedBuiltinIds").length === 0, "fremde Löschungen werden nicht übernommen");

  const foreign = { type: "ipsc-training-export", customDrills: [{ id: "custom-1", title: "Neue Übung", category: "Draw", procedure: "p" }],
    scoreLogs: { "custom-1": [{ date: "2026-09-10T10:00:00.000Z", alpha: 6, time: 2 }], "gibtsnicht": [{ date: "2026-09-10T10:00:00.000Z", alpha: 1, time: 1 }] },
    favorites: ["custom-1"] };
  E("importFile")(new w.File([JSON.stringify(foreign)], "f.json")); await sleep(50);
  const nd = E("customDrills").find((d) => d.title === "Neue Übung");
  ok(nd && nd.id !== "custom-1" && E("scoreLogs")[nd.id].length === 1, "ID-Kollision: fremde Ergebnisse landen beim fremden Training");
  ok(!E("scoreLogs")["gibtsnicht"], "Ergebnisse ohne Training werden verworfen");
  ok(E("favorites").has(nd.id) && !E("favorites").has("custom-1"), "importierte Favoriten werden richtig zugeordnet");

  E("toggleFavorite")("custom-1");
  E("deleteDrill")(E("DRILLS").find((d) => d.id === "custom-1"));
  ok(!E("scoreLogs")["custom-1"] && !E("favorites").has("custom-1"), "Löschen entfernt Ergebnisse und Favorit");
  ok(!$("#undo-toast").classList.contains("hidden") && /Übergänge & Reloads/.test($("#undo-toast-text").textContent), "Rückgängig-Hinweis nennt die gelöschte Übung");
  E("performUndo")();
  ok(E("customDrills").some((d) => d.id === "custom-1") && E("scoreLogs")["custom-1"] && E("favorites").has("custom-1") && $("#undo-toast").classList.contains("hidden"),
    "Rückgängig stellt eigene Übung, Ergebnisse und Favorit wieder her");

  ok(E("slugify")("Übergänge & Reloads") === "uebergaenge-reloads", "Dateinamen mit Umlauten");

  // Standard-Übung löschen nutzt den anderen Zweig von deleteDrill (deletedBuiltinIds statt customDrills)
  const { E: E2 } = boot();
  const presi = E2("DRILLS").find((d) => d.id === "std-el-presidente");
  E2("deleteDrill")(presi);
  ok(E2("deletedBuiltinIds").includes("std-el-presidente") && !E2("DRILLS").some((d) => d.id === "std-el-presidente"), "Standard-Übung löschen");
  E2("performUndo")();
  ok(!E2("deletedBuiltinIds").includes("std-el-presidente") && E2("DRILLS").some((d) => d.id === "std-el-presidente"), "Rückgängig stellt gelöschte Standard-Übung wieder her");
}

async function testLibrarySearchFavorites() {
  section("Bibliothek, Suche, Favoriten");
  let { w, E, $, $$ } = boot();
  ok(E("DRILLS").length === 19 && $("#result-count").textContent === "19 von 19 Trainings", "19 Standard-Übungen geladen");
  let errors = 0;
  for (const d of E("DRILLS")) { try { E("openDetail")(d); if (!$("#detail-content svg")) errors++; } catch (e) { errors++; } }
  E("closeDetail")();
  ok(errors === 0 && E("bodyScrollLockCount") === 0, "alle Detailansichten rendern, Scroll-Sperre sauber");
  ok($$(".builder-toolbar .tool-icon svg").length >= 25, "Werkzeugleiste zeigt Symbole für alle Werkzeuge: " + $$(".builder-toolbar .tool-icon svg").length);
  const paperSvg = E("targetEl")({ type: "paper", x: 100, y: 100, label: "T1" });
  ok((paperSvg.match(/<polygon/g) || []).length === 3 && paperSvg.includes("#c79c71"), "Papierziel: Achteck mit C- und A-Zone");
  ok(E("targetEl")({ type: "popper", x: 100, y: 100, label: "" }).includes("#5dc9f8") && E("targetEl")({ type: "steel", x: 100, y: 100, label: "" }).includes("<circle"), "Popper und Plate in Hellblau");

  const search = (q) => { const el = $("#filter-search"); el.value = q; el.dispatchEvent(new w.Event("input")); return $$(".drill-card").map((c) => c.querySelector("h3").textContent); };
  ok(search("bill").length === 1, "Suche „bill“ findet den Bill Drill");
  ok(search("prazision").join() === search("Präzision").join() && search("prazision").length === 1, "Suche ignoriert Umlaute");
  ok(search("magazin").length >= 2, "Suche durchsucht auch Ausrüstung und Ablauf");
  ok(search("ziele nebeneinander").length >= 2, "mehrere Suchbegriffe werden kombiniert");
  ok(search("xyzgibtsnicht").length === 0 && /Suche oder Filter/.test($(".no-results").textContent), "leeres Suchergebnis zeigt Hinweis");
  search("");

  const cardOf = (title) => $$(".drill-card").find((c) => c.querySelector("h3").textContent === title);
  cardOf("El Presidente").querySelector(".fav-btn").click();
  ok($("#detail-overlay").classList.contains("hidden"), "Stern-Klick öffnet nicht die Detailansicht");
  ok($$(".drill-card")[0].querySelector("h3").textContent === "El Presidente", "Favoriten stehen oben");
  $("#filter-fav").click();
  ok($$(".drill-card").length === 1 && $("#filter-fav").getAttribute("aria-pressed") === "true", "Filter „Nur Favoriten“");
  $("#filter-reset").click();
  ok($$(".drill-card").length === 19 && $("#filter-search").value === "", "Zurücksetzen löscht Suche und Favoriten-Filter");

  ({ w, E, $, $$ } = boot({ storage: { ipscFavorites: ["std-el-presidente"] } }));
  ok(E("isFavorite")("std-el-presidente") && $$(".drill-card")[0].querySelector(".fav-btn.active"), "Favoriten bleiben nach Neustart erhalten");
  E("openDetail")(E("DRILLS").find((d) => d.id === "std-el-presidente"));
  $("#fav-drill-btn").click();
  ok(!E("isFavorite")("std-el-presidente") && $("#fav-drill-btn").textContent.includes("☆"), "Favorit in der Detailansicht umschaltbar");
  E("closeDetail")();
}

async function testSettingsStatsTimer() {
  section("Einstellungen, Auswertung, Par-Timer");
  const log = [];
  for (let i = 0; i < 10; i++) log.push({ date: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00.000Z`, alpha: 4 + (i % 3), charlie: 2 - (i % 3), delta: 0, mike: 0, noshoot: 0, time: 2 + i * 0.05, major: false });
  const { w, E, $, $$ } = boot({ storage: { ipscScoreLogs: { "std-bill-drill": log } } });

  $("#settings-btn").click();
  ok(!$("#settings-overlay").classList.contains("hidden") && $("#settings-version").textContent.includes(E("APP_VERSION")), "Einstellungen öffnen mit Versionsanzeige");
  $("#set-power").value = "major"; $("#set-delay").value = "1-3"; $("#set-reps").value = "3";
  $("#settings-save").click();
  ok($("#settings-overlay").classList.contains("hidden") && JSON.parse(w.localStorage.getItem("ipscSettings")).powerFactor === "major", "Einstellungen gespeichert");
  ok(E("bodyScrollLockCount") === 0, "Scroll-Sperre nach Einstellungen aufgehoben");

  const bill = E("DRILLS").find((d) => d.id === "std-bill-drill");
  E("openDetail")(bill);
  ok($("#score-major").value === "1" && $("#timer-delay").value === "1-3" && $("#timer-reps").value === "3", "Einstellungen gelten in Ergebnis-Formular und Timer");

  const stats = E("scoreStats")(E("getScoreLog")("std-bill-drill"), 2.5);
  const values = $$stat(w);
  ok(values["Versuche"] === "10", "Auswertung: 10 Versuche");
  ok(values["Bester Hit-Factor"] === stats.best.toFixed(2), "Auswertung: Bestwert " + values["Bester Hit-Factor"]);
  ok(/zu den 5 davor/.test($(".stat-trend").textContent), "Auswertung: Trend gegenüber den 5 Versuchen davor");
  ok(values["Innerhalb Par (2.5 s)"] === "10 von 10", "Auswertung: Par-Quote");
  ok($(".score-chart-wrap svg polyline") && $(".legend-best"), "Diagramm mit Durchschnittslinie und Bestwert");

  ok($("#score-alpha").readOnly && $$(".score-stepper-btn").length > 0, "Schnelleingabe: A/C/D/Miss als Plus/Minus-Zähler statt Zahlenfeld");
  $(`.score-stepper-minus[data-target="score-mike"]`).click();
  ok($("#score-mike").value === "0", "Minus-Zähler geht nicht unter 0");
  for (let i = 0; i < 10; i++) $(`.score-stepper-plus[data-target="score-alpha"]`).click();
  for (let i = 0; i < 3; i++) $(`.score-stepper-plus[data-target="score-mike"]`).click();
  ok($("#score-alpha").value === "10" && $("#score-mike").value === "3" && /Punkte/.test($("#score-live-result").textContent), "Plus-Zähler zählt hoch und aktualisiert die Live-Anzeige");
  $(`.score-stepper-minus[data-target="score-mike"]`).click();
  ok($("#score-mike").value === "2", "Minus-Zähler zählt wieder runter");
  $("#score-alpha").value = "0"; $("#score-mike").value = "0";

  $("#score-alpha").value = "6"; $("#score-charlie").value = "0"; $("#score-time").value = "1.5";
  $("#score-add-btn").click();
  ok(/Neuer Bestwert/.test($("#score-live-result").textContent), "neuer Bestwert wird gemeldet");
  ok(E("getScoreLog")("std-bill-drill").slice(-1)[0].major === true, "neuer Eintrag nutzt Major aus den Einstellungen");

  const sel = $("#timer-delay"); const opt = w.document.createElement("option"); opt.value = "0.1-0.1"; sel.appendChild(opt); sel.value = "0.1-0.1";
  $("#timer-par").value = "0.2"; $("#timer-reps").value = "1";
  ok($("#timer-to-score").classList.contains("hidden"), "„Ergebnis eintragen“ vor dem Timer versteckt");
  $("#timer-start").click();
  await sleep(250);
  ok(/s$/.test($("#timer-display").textContent), "Timer läuft: " + $("#timer-display").textContent);
  await sleep(900);
  ok(!$("#timer-start").disabled && !$("#timer-to-score").classList.contains("hidden"), "nach dem Timer: Button „Ergebnis eintragen“");
  $("#timer-to-score").click();
  ok(w.document.activeElement === $("#score-alpha"), "Button springt ins Ergebnis-Formular");
  $("#timer-start").click();
  E("closeDetail")();
  ok(!E("parTimer").running && E("parTimer").timeouts.length === 0, "Schließen stoppt den Timer");
}

function $$stat(w) {
  const out = {};
  for (const box of w.document.querySelectorAll(".score-stats .stat-box")) {
    out[box.querySelector(".label").textContent] = box.querySelector(".value").textContent;
  }
  return out;
}

async function testSharingAndSketch() {
  section("Teilen, Skizze als Bild");
  const custom = { title: "Mein Drill Ärger", category: "Eigene", procedure: "Test", rounds: 3, parTime: "2,2 s",
    layout: { targets: [{ type: "paper", x: 101.6, y: 99.4, label: "T1" }], shooterPositions: [{ x: 200, y: 430, facing: 45, label: "Start" }] } };
  let { w, E, $ } = boot();
  const link = await E("buildShareLink")(custom);
  const hash = link.slice(link.indexOf("#"));
  ok(link.includes("#t=z") && (await E("decodeSharedHash")(hash)).title === custom.title, "Link erzeugen und dekodieren");
  let maxLen = 0;
  for (const d of E("DRILLS")) maxLen = Math.max(maxLen, (await E("buildShareLink")(d)).length);
  ok(maxLen < 1500, `längster Bibliotheks-Link ${maxLen} Zeichen`);

  ({ w, E, $ } = boot({ hash }));
  await sleep(100);
  ok($(".preview-banner") && !$("#score-section") && $("#timer-to-score").classList.contains("hidden"), "Link öffnet Vorschau ohne Ergebnis-Bereich");
  $("#preview-add-btn").click(); await sleep(20);
  ok(E("customDrills").length === 1 && w.location.hash === "", "Vorschau speichern entfernt Link aus der Adresse");
  E("closeDetail")();
  await E("openSharedDrill")(hash);
  ok(E("customDrills").length === 1 && !$(".preview-banner"), "gleicher Link erzeugt kein Duplikat");
  E("closeDetail")();

  w.lastAlert = null;
  await E("openSharedDrill")("#t=zAAAAkaputt");
  ok(/beschädigt/.test(w.lastAlert || ""), "kaputter Link: verständliche Meldung");
  const evil = { title: "x", category: "y", layout: { targets: [{ type: "paper", x: evilValue, y: 1 }] } };
  await E("openSharedDrill")("#t=p" + E("bytesToBase64Url")(new TextEncoder().encode(JSON.stringify(evil)))); await sleep(20);
  ok(!$("[onerror]") && w.pwned === undefined, "manipulierter Link führt keinen Code aus");
  E("closeDetail")();

  const presi = E("DRILLS").find((d) => d.id === "std-el-presidente");
  E("openDetail")(presi);
  $("#share-drill-btn").click();
  $("#share-qr-btn").click(); await sleep(50);
  ok($(".qr-wrap svg path"), "QR-Code wird erzeugt");

  const svg = E("buildSketchImageSvg")({ ...presi, title: "Titel <mit> & Zeichen" });
  ok(svg.includes("Titel &lt;mit&gt; &amp; Zeichen") && svg.includes('translate(0, 92)') && svg.includes("<polygon"), "Skizzen-Bild enthält Titel, Infos und Skizze");
  w.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(new Error("kein Canvas")), 0); } };
  w.URL.createObjectURL = () => "blob:test"; w.URL.revokeObjectURL = () => {};
  $("#sketch-image-btn").click(); await sleep(50);
  ok(/SVG/.test($("#sketch-msg").textContent), "ohne PNG-Unterstützung wird eine SVG-Grafik gespeichert");
  E("closeDetail")();
}

async function testMultiShare() {
  section("Mehrere Übungen teilen");
  let { w, E, $, $$ } = boot();

  const presi = E("DRILLS").find((d) => d.id === "std-el-presidente");
  const bill = E("DRILLS").find((d) => d.id === "std-bill-drill");
  const link = await E("buildMultiShareLink")([presi, bill]);
  const hash = link.slice(link.indexOf("#"));
  ok(link.includes("#tm=z"), "Mehrfach-Link nutzt eigenen Hash-Präfix #tm=");
  const decoded = await E("decodeMultiSharedHash")(hash);
  ok(decoded.length === 2 && decoded[0].title === presi.title && decoded[1].title === bill.title, "Mehrfach-Link dekodiert beide Übungen");

  // UI: Auswahl treffen, Link + QR erzeugen
  $("#share-multi-btn").click();
  ok(!$("#multishare-overlay").classList.contains("hidden"), "Dialog öffnet sich");
  $("#ms-search").value = "presidente";
  $("#ms-search").dispatchEvent(new w.Event("input"));
  ok($$(".journal-drill:not(.hidden)").length === 1, "Suche filtert die Übungsliste");
  $("#ms-search").value = "";
  $("#ms-search").dispatchEvent(new w.Event("input"));
  $(`.journal-drill input[value="std-el-presidente"]`).click();
  $(`.journal-drill input[value="std-bill-drill"]`).click();
  ok($("#ms-count").textContent === "2 ausgewählt" && !$("#ms-link-btn").disabled, "Auswahl zählt mit und schaltet die Buttons frei");
  $("#ms-link-btn").click(); await sleep(20);
  ok($(".share-link-field").value.includes("#tm="), "Link-Button zeigt einen Mehrfach-Link");
  $("#ms-qr-btn").click(); await sleep(50);
  ok($(".qr-wrap svg path"), "QR-Code für die Auswahl wird erzeugt");
  E("closeMultiShare")();
  ok(E("bodyScrollLockCount") === 0, "Scroll-Sperre nach dem Dialog aufgehoben");

  // Empfang: bestätigen fügt beide hinzu, lehnt man ab passiert nichts
  ({ w, E, $ } = boot());
  w.confirmAnswer = false;
  await E("openMultiSharedDrills")(hash);
  ok(E("customDrills").length === 0, "Ablehnen im Bestätigungsdialog fügt nichts hinzu");
  w.confirmAnswer = true;
  await E("openMultiSharedDrills")(hash);
  ok(E("customDrills").length === 2, "Bestätigen fügt beide Übungen hinzu");
  await E("openMultiSharedDrills")(hash);
  ok(E("customDrills").length === 2 && /bereits vorhanden/.test($("#db-tools-msg").textContent), "erneutes Einlesen erzeugt keine Duplikate");
  E("closeDetail")();

  // kaputter Link
  w.lastAlert = null;
  await E("openMultiSharedDrills")("#tm=zAAAAkaputt");
  ok(/beschädigt/.test(w.lastAlert || ""), "kaputter Mehrfach-Link: verständliche Meldung");

  // manipulierte Daten im Mehrfach-Link führen keinen Code aus
  const evil = [{ title: "x", category: "y", layout: { targets: [{ type: "paper", x: evilValue, y: 1 }] } }];
  w.confirmAnswer = true;
  await E("openMultiSharedDrills")("#tm=p" + E("bytesToBase64Url")(new TextEncoder().encode(JSON.stringify(evil)))); await sleep(20);
  ok(!$("[onerror]") && w.pwned === undefined, "manipulierter Mehrfach-Link führt keinen Code aus");
  E("closeDetail")();

  // Link einfügen (Prompt) routet Mehrfach-Links korrekt
  ({ w, E, $ } = boot());
  w.promptAnswer = link;
  w.confirmAnswer = true;
  E("importFromPastedLink")(); await sleep(20);
  ok(E("customDrills").length === 2, "„Link einfügen“ erkennt einen Mehrfach-Link und importiert beide Übungen");
}

async function testShotPlan() {
  section("Schussplan");
  let { w, E, $, $$ } = boot();
  const presi = E("DRILLS").find((d) => d.id === "std-el-presidente");
  const a = E("analyzePlan")(presi.layout, 15, true);
  ok(a.total === 12 && a.reloads === 1 && a.warnings.length === 0 && a.missing.length === 0, "El Presidente: 12 Schuss, 1 Wechsel, keine Warnung");
  const small = E("analyzePlan")(presi.layout, 5, false);
  ok(small.warnings.length === 2 && /Schritt 3/.test(small.warnings[0]), "zu kleines Magazin wird mit Schritt gemeldet: " + small.warnings[0]);
  E("openDetail")(presi);
  ok($$(".plan-steps li").length === 7 && $$(".plan-steps .plan-reload").length === 1, "Detailansicht zeigt den Schussplan");
  ok($$("#detail-content .plan-badge").length === 3 && $$("#detail-content .plan-badge text")[0].textContent === "1/4", "Skizze zeigt Reihenfolge-Nummern an den Zielen");
  E("closeDetail")();

  E("openCreate")();
  w.document.querySelector('.tool-select[data-tool="target"]').click();
  E("placeAtPoint")({ x: 100, y: 100 });
  E("placeAtPoint")({ x: 200, y: 100 });
  w.document.querySelector('.tool-select[data-tool="noshoot"]').click();
  E("placeAtPoint")({ x: 300, y: 100 });
  w.document.querySelector('.tool-select[data-tool="plan"]').click();
  E("addPlanTarget")(0); E("addPlanTarget")(2); E("addPlanTarget")(1);
  $("#plan-reload-btn").click();
  E("addPlanTarget")(0);
  ok(E("builderLayout").plan.length === 4, "No-Shoot lässt sich nicht einplanen");
  ok($$("#builder-plan .plan-steps li").length === 4 && /Nicht im Plan/.test($("#builder-plan").textContent) === false, "Editor zeigt den Plan live");
  E("deleteElement")({ kind: "target", index: 0 });
  ok(JSON.stringify(E("builderLayout").plan) === JSON.stringify([{ type: "target", index: 0 }, { type: "reload" }]), "gelöschtes Ziel wird aus dem Plan entfernt, Nummern rücken nach");
  w.document.querySelector('.tool-select[data-tool="target"]').click();
  E("placeAtPoint")({ x: 50, y: 50 });
  w.document.querySelector('.tool-select[data-tool="plan"]').click();
  E("addPlanTarget")(2);
  E("undoBuilder")();
  ok(E("builderLayout").plan.length === 2, "Rückgängig entfernt den letzten Planschritt");
  $("#f-title").value = "Plan-Test"; $("#f-category").value = "Test"; $("#f-procedure").value = "x";
  $("#create-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  const saved = E("customDrills").find((d) => d.title === "Plan-Test");
  ok(saved && saved.layout.plan.length === 2, "Plan wird mit dem Training gespeichert");
  const link = await E("buildShareLink")(saved);
  const decoded = await E("decodeSharedHash")(link.slice(link.indexOf("#")));
  ok(decoded.layout.plan.length === 2, "Plan bleibt beim Teilen per Link erhalten");
  const bad = E("sanitizeLayout")({ targets: [{ type: "paper", x: 1, y: 1 }], plan: [{ type: "target", index: 5 }, { type: "target", index: "0" }, { type: "evil" }, { type: "reload" }] });
  ok(JSON.stringify(bad.plan) === JSON.stringify([{ type: "target", index: 0 }, { type: "reload" }]), "ungültige Planschritte werden verworfen");
}

async function testPlanWalkthrough() {
  section("Ablauf-Animation");
  let { w, E, $, $$ } = boot();
  const presi = E("DRILLS").find((d) => d.id === "std-el-presidente");
  E("openDetail")(presi);
  ok($("#plan-play-btn") && $("#plan-play-btn").textContent.includes("Ablauf abspielen"), "Abspiel-Button erscheint bei einem Training mit Schussplan");
  ok(!$(".plan-play-bullet"), "keine Patrone, bevor abgespielt wird");

  $("#plan-play-btn").click();
  ok($("#plan-play-btn").textContent.includes("Stoppen"), "Button wechselt beim Abspielen zu „Stoppen“");
  const steps = E("planSteps")(presi.layout);
  ok($(".plan-steps > li").classList.contains("plan-active"), "erste Zeile im Schussplan ist markiert");
  ok(!$(".plan-play-bullet"), "erste Patrone fliegt erst nach kurzer Verzögerung los");
  ok(steps[0].rounds === 2, "El Presidente T1: 2 Schuss geplant");

  await sleep(220);
  ok($$(".plan-play-bullet").length >= 1, "Patrone fliegt zum ersten Ziel");

  await sleep(1000);
  const liList = [...w.document.querySelectorAll(".plan-steps > li")];
  ok(!liList[0].classList.contains("plan-active") && liList[1].classList.contains("plan-active"), "Animation springt nach dem Takt zur nächsten Zeile");
  ok(!$$(".plan-play-bullet").length, "Patronen des ersten Schritts sind schon wieder verschwunden");

  E("stopPlanWalkthrough")();
  ok(!$(".plan-play-bullet") && $("#plan-play-btn").textContent.includes("Ablauf abspielen") && !liList.some((li) => li.classList.contains("plan-active")), "Stoppen räumt Patronen, Button und Markierungen auf");

  // Schließen der Detailansicht während des Abspielens räumt ebenfalls auf
  $("#plan-play-btn").click();
  await sleep(220);
  ok($$(".plan-play-bullet").length >= 1, "Patrone fliegt, bevor die Detailansicht geschlossen wird");
  E("closeDetail")();
  ok(!w.document.querySelector(".plan-play-bullet"), "Schließen der Detailansicht beendet eine laufende Animation");

  // Trainings ohne Schussplan zeigen keinen Button
  const noPlan = { title: "Ohne Plan", category: "Test", procedure: "x", layout: { targets: [{ type: "paper", x: 10, y: 10 }] } };
  E("openDetail")(noPlan);
  ok(!$("#plan-play-btn"), "kein Abspiel-Button ohne Schussplan");
  E("closeDetail")();

  // Raster-Skizze (Bild statt Vektor-Layout) hat kein SVG - Abspielen bricht sauber ab
  const withImage = { ...presi, sketchDataUrl: "data:image/png;base64,AAAA" };
  E("openDetail")(withImage);
  $("#plan-play-btn").click();
  ok(!$(".plan-play-bullet"), "ohne SVG (Bild-Skizze) wird nichts animiert");
  E("closeDetail")();

  ok(!presi.layout.path.length, "El Presidente hat keinen Bewegungspfad");
  E("openDetail")(presi);
  $("#plan-play-btn").click();
  ok(!$("#plan-play-shooter"), "ohne layout.path kein zusätzlicher Bewegungs-Marker");
  E("stopPlanWalkthrough")();
  E("closeDetail")();

  // Bewegungsdrill mit layout.path: eigener Marker wandert parallel entlang des Pfads
  const boxToBox = E("DRILLS").find((d) => d.id === "std-box-to-box");
  E("openDetail")(boxToBox);
  $("#plan-play-btn").click();
  const shooter = $("#plan-play-shooter");
  const [p0, p1] = boxToBox.layout.path;
  ok(shooter && Number(shooter.getAttribute("cx")) === p0[0] && Number(shooter.getAttribute("cy")) === p0[1], "Bewegungs-Marker startet am Anfang des Pfads");

  await sleep(450);
  const midX = Number($("#plan-play-shooter").getAttribute("cx"));
  ok(midX > Math.min(p0[0], p1[0]) && midX < Math.max(p0[0], p1[0]), "Bewegungs-Marker wandert zwischen Anfang und Ende des Pfads: x=" + midX);

  E("stopPlanWalkthrough")();
  ok(!$("#plan-play-shooter"), "Stoppen entfernt auch den Bewegungs-Marker");
  E("closeDetail")();

  // Sichtbarer Magazinwechsel bei Reload-Schritten
  const reloadDrill = {
    title: "Reload-Test", category: "Test", procedure: "x",
    layout: { viewW: 400, viewH: 500, targets: [{ type: "paper", x: 100, y: 100, label: "T1" }],
      shooterPositions: [{ x: 100, y: 400, label: "Start" }], plan: [{ type: "target", index: 0 }, { type: "reload" }] }
  };
  E("openDetail")(reloadDrill);
  $("#plan-play-btn").click();
  await sleep(1200);
  ok($(".plan-play-mag-out") && $(".plan-play-mag-in"), "Magazinwechsel: altes Magazin fällt heraus, neues rutscht nach");
  E("stopPlanWalkthrough")();
  ok(!$(".plan-play-mag-out"), "Stoppen entfernt auch die Magazin-Animation");
  E("closeDetail")();

  const origin1 = E("nearestShooterOrigin")({ shooterPositions: [{ x: 10, y: 10 }, { x: 500, y: 500 }] }, { x: 20, y: 20 });
  ok(origin1.x === 10 && origin1.y === 10, "nearestShooterOrigin: wählt die nächste Schützenposition");
  const origin2 = E("nearestShooterOrigin")({ shooterPositions: [], viewH: 500 }, { x: 100, y: 100 });
  ok(origin2.x === 100 && origin2.y === 250, "nearestShooterOrigin: ohne Schützenposition ein Punkt unterhalb des Ziels");

  const along = E("pointAlongPath");
  ok(JSON.stringify(along([[0, 0], [10, 0], [10, 10]], 0)) === JSON.stringify({ x: 0, y: 0 }), "pointAlongPath: Anfang bei Anteil 0");
  ok(JSON.stringify(along([[0, 0], [10, 0], [10, 10]], 1)) === JSON.stringify({ x: 10, y: 10 }), "pointAlongPath: Ende bei Anteil 1");
  ok(JSON.stringify(along([[0, 0], [10, 0], [10, 10]], 0.5)) === JSON.stringify({ x: 10, y: 0 }), "pointAlongPath: Mitte der Gesamtlänge liegt am Eckpunkt");
}

async function testStageEditor() {
  section("Stage-Editor und neue Symbole");
  let { w, E, $, $$ } = boot();
  const tool = (name) => w.document.querySelector(`.tool-select[data-tool="${name}"]`).click();

  E("openCreate")();
  $("#open-stage-editor").click();
  ok(!$("#stage-editor").classList.contains("hidden") && w.document.body.classList.contains("stage-editor-open"), "Stage-Editor öffnet im Vollbild");
  ok($("#se-width").value === "20" && $("#se-depth").value === "25", "Standardgröße 20 × 25 m");
  $("#se-width").value = "40"; $("#se-width").dispatchEvent(new w.Event("change"));
  ok(E("builderLayout").viewW === 800 && $("#builder-svg").getAttribute("viewBox") === "-20.0 -20.0 840.0 540.0", "Stagegröße ändern passt Fläche und Ansicht an");
  $("#se-zoom-in").click();
  const zoomed = $("#builder-svg").getAttribute("viewBox");
  ok(zoomed !== "-20.0 -20.0 840.0 540.0" && parseFloat(zoomed.split(" ")[2]) < 840, "Vergrößern zoomt hinein");
  $("#se-fit").click();
  ok($("#builder-svg").getAttribute("viewBox") === "-20.0 -20.0 840.0 540.0", "Einpassen zeigt die ganze Stage");
  ok(E("builderTool") === "select", "Editor startet mit dem Auswahlwerkzeug");

  tool("target");
  E("handleBuilderTap")({ x: 103, y: 97 }, null);
  ok(E("builderLayout").targets[0].x === 100 && E("builderLayout").targets[0].y === 100, "Raster: Position rastet auf halbe Meter ein");
  $("#se-snap").checked = false; $("#se-snap").dispatchEvent(new w.Event("change"));
  E("handleBuilderTap")({ x: 203, y: 97 }, null);
  ok(E("builderLayout").targets[1].x === 203, "ohne Raster wird exakt gesetzt");
  $("#se-snap").checked = true; $("#se-snap").dispatchEvent(new w.Event("change"));

  tool("select");
  E("handleBuilderTap")({ x: 100, y: 100 }, E("hitTestBuilder")({ x: 100, y: 100 }));
  ok(!$("#se-panel").classList.contains("hidden") && /Papierziel/.test($("#se-panel").textContent), "Tippen auf ein Ziel öffnet die Auswahl");
  $("#se-label").value = "T9"; $("#se-label").dispatchEvent(new w.Event("input"));
  ok(E("builderLayout").targets[0].label === "T9" && /T9/.test($("#builder-svg").innerHTML), "Beschriftung ändern");
  $('[data-rot="15"]').click();
  ok(E("builderLayout").targets[0].rot === 15 && /rotate\(15 100 100\)/.test($("#builder-svg").innerHTML), "Ziel drehen");
  $("#se-hardcover").value = "left"; $("#se-hardcover").dispatchEvent(new w.Event("change"));
  ok(E("builderLayout").targets[0].hardcover === "left" && /fill="#111"/.test($("#builder-svg").innerHTML), "Hardcover links wird gezeichnet");
  $("#se-duplicate").click();
  const dup = E("builderLayout").targets[2];
  ok(dup && dup.x === 120 && dup.y === 120 && dup.label === "T3" && dup.hardcover === "left", "Duplizieren mit Versatz und neuer Beschriftung");
  $("#se-delete").click();
  ok(E("builderLayout").targets.length === 2 && $("#se-panel").classList.contains("hidden"), "Löschen über die Auswahl");

  tool("popper");
  E("handleBuilderTap")({ x: 300, y: 300 }, null);
  tool("mover");
  E("handleBuilderTap")({ x: 400, y: 200 }, null);
  ok(/Mover/.test($("#se-panel").textContent) && /Kein Auslöser/.test($("#se-panel").textContent), "neuer Mover ist ausgewählt, noch ohne Auslöser");
  $("#se-pick-activator").click();
  E("handleBuilderTap")({ x: 300, y: 300 }, E("hitTestBuilder")({ x: 300, y: 300 }));
  const mover = E("builderLayout").targets[3];
  ok(mover.activatedBy === 2 && $$("#builder-svg .activator-link").length === 1 && /Aktiviert durch P1/.test($("#se-panel").textContent), "Auslöser zuweisen (Popper P1 aktiviert den Mover)");
  E("deleteElement")({ kind: "target", index: 0 });
  ok(E("builderLayout").targets[2].activatedBy === 1, "Auslöser-Bezug rückt beim Löschen eines Ziels nach");
  E("deleteElement")({ kind: "target", index: 1 });
  ok(E("builderLayout").targets[1].activatedBy === undefined, "gelöschter Auslöser wird entfernt");

  tool("fault");
  E("handleBuilderTap")({ x: 20, y: 400 }, null);
  E("handleBuilderTap")({ x: 780, y: 400 }, null);
  ok(E("builderLayout").faults.length === 1 && /#d9412b/.test($("#builder-svg").innerHTML), "Fault Line mit zwei Tipps");
  tool("select");
  E("handleBuilderTap")({ x: 400, y: 401 }, E("hitTestBuilder")({ x: 400, y: 401 }));
  ok(/Fault Line/.test($("#se-panel").textContent), "Fault Line ist in der Mitte antippbar");
  $('[data-rot="45"]').click();
  const f = E("builderLayout").faults[0];
  ok(Math.round(f.x1 + f.x2) === 800 && f.y1 !== f.y2, "Linie dreht sich um ihre Mitte");

  tool("path");
  E("handleBuilderTap")({ x: 40, y: 420 }, null);
  E("handleBuilderTap")({ x: 400, y: 420 }, null);
  ok(E("builderLayout").path.length === 2 && /polyline/.test($("#builder-svg").innerHTML), "Laufweg: zwei Punkte gesetzt und gezeichnet");
  $("#path-clear-btn").click();
  ok(E("builderLayout").path.length === 0 && !/polyline/.test($("#builder-svg").innerHTML) && E("builderLayout").faults.length === 1, "Laufweg löschen entfernt nur den Pfad, nicht den Rest der Stage");

  tool("text");
  E("handleBuilderTap")({ x: 200, y: 460 }, null);
  ok(E("builderLayout").texts[0].text === "Text" && w.document.activeElement === $("#se-label"), "Text setzen, Eingabefeld hat den Fokus");
  $("#se-label").value = "Waffe geladen auf Tisch"; $("#se-label").dispatchEvent(new w.Event("input"));
  ok(/Waffe geladen auf Tisch/.test($("#builder-svg").innerHTML), "Text erscheint in der Skizze");
  for (const t of ["port", "tuer", "fass", "mini", "minipopper", "metalns", "dropturner", "clamshell"]) { tool(t); E("handleBuilderTap")({ x: 100 + Math.random() * 600, y: 100 + Math.random() * 300 }, null); }
  ok(E("builderLayout").props.length === 3 && E("builderLayout").targets.length === 7, "Port, Tür, Fass und alle neuen Ziele setzbar");

  const kb = new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true });
  w.document.dispatchEvent(kb);
  ok($("#stage-editor").classList.contains("hidden") && !$("#create-overlay").classList.contains("hidden"), "Escape schließt zuerst nur den Editor");
  ok($("#builder-preview svg") && /Laut Skizze/.test($("#builder-summary").textContent), "Vorschau und Schusszahl im Formular aktualisiert");
  $("#f-title").value = "Editor-Test"; $("#f-category").value = "Test"; $("#f-procedure").value = "x";
  $("#create-form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  const saved = E("customDrills").find((d) => d.title === "Editor-Test");
  ok(saved && saved.layout.viewW === 800 && saved.layout.faults.length === 1 && saved.layout.texts[0].text === "Waffe geladen auf Tisch", "Training mit Größe, Fault Line und Text gespeichert");
  const link = await E("buildShareLink")(saved);
  const back = await E("decodeSharedHash")(link.slice(link.indexOf("#")));
  ok(back.layout.faults.length === 1 && back.layout.texts.length === 1 && back.layout.props.some((p) => p.type === "port"), "neue Elemente bleiben beim Teilen erhalten");

  const sum = E("layoutTargetSummary")({ targets: ["paper", "mini", "mover", "steel", "popper", "minipopper", "metalns", "noshoot"].map((type) => ({ type, x: 0, y: 0 })) });
  ok(sum.rounds === 9 && sum.paper === 3 && sum.popper === 2 && sum.plate === 1 && sum.noshoot === 2, "Schusszahl zählt neue Zieltypen richtig (9 Schuss)");
  let renderErrors = 0;
  for (const type of E("TARGET_TYPES")) { try { if (!E("targetEl")({ type, x: 50, y: 50, label: "X", rot: 30, hardcover: "bottom" })) renderErrors++; } catch (e) { renderErrors++; } }
  for (const type of E("PROP_TYPES")) { try { if (!E("propEl")({ type, x: 50, y: 50, label: "", rot: 90 })) renderErrors++; } catch (e) { renderErrors++; } }
  ok(renderErrors === 0, "alle Ziel- und Aufbausymbole werden gezeichnet");
  const clean = E("sanitizeLayout")({ targets: [{ type: "mover", x: 1, y: 1, activatedBy: 0, hardcover: "evil", rot: "45" }, { type: "clamshell", x: 2, y: 2, activatedBy: 0 }],
    texts: [{ x: 1, y: 1, text: "<script>" }, { x: 1, y: 1, text: "  " }], faults: [{ x1: "a", y1: 1, x2: 2, y2: 3 }] });
  ok(clean.targets[0].activatedBy === undefined && clean.targets[0].hardcover === undefined && clean.targets[0].rot === 45 && clean.targets[1].activatedBy === undefined, "Sanitizer: ungültige Auslöser und Hardcover-Werte werden verworfen");
  ok(clean.texts.length === 1 && clean.faults[0].x1 === 0, "Sanitizer: leere Texte verworfen, Koordinaten als Zahlen");
  E("openDetail")(saved);
  ok(/Waffe geladen auf Tisch/.test($("#detail-content").innerHTML) && !$("[onerror]"), "Detailansicht zeigt die Stage sicher an");
  E("closeDetail")();
}

async function testMatches() {
  section("Match-Analyse");
  let { w, E, $, $$ } = boot();
  const r = E("stageResult")({ alpha: 10, charlie: 2, delta: 0, mike: 1, noshoot: 0, procedural: 0, time: 5, maxPoints: 0, winnerHF: 10 }, false);
  ok(r.points === 46 && r.hf === 9.2 && r.maxPoints === 65 && r.lostTotal === 19 && Math.abs(r.percent - 92) < 0.001, "Stage: 46 Punkte, HF 9.2, 19 Punkte verloren, 92 %");
  ok(E("calcIpscPoints")(0, 0, 0, 1, 0, 0, false) === 0 && E("calcIpscPoints")(2, 0, 0, 1, 0, 0, false) === 0 && E("calcIpscPoints")(3, 0, 0, 1, 0, 0, false) === 5, "Miss = 10 Strafpunkte (3A + 1 Miss = 15 − 10 = 5)");
  ok(r.maxPoints - r.points === r.lostTotal, "Punktverlust entspricht genau dem Abstand zur Höchstpunktzahl");

  $("#matches-btn").click();
  ok(/Noch keine Matches/.test($("#match-content").textContent), "Matches öffnen leer");
  $("#match-new-btn").click();
  $("#m-name").value = "Vienna Open"; $("#m-division").value = "Production";
  const fill = (card, values) => { for (const [k, v] of Object.entries(values)) card.querySelector(`[data-key="${k}"]`).value = v; };
  fill($$(".stage-card")[0], { name: "Stage 1", alpha: 20, charlie: 4, time: 12, winnerHF: 9, drillId: "std-el-presidente" });
  $("#m-add-stage").click();
  ok($$(".stage-card").length === 2 && $$(".stage-card")[0].querySelector('[data-key="alpha"]').value === "20" && $("#m-name").value === "Vienna Open", "Stage hinzufügen behält die Eingaben");
  fill($$(".stage-card")[1], { alpha: 10, charlie: 2, delta: 2, mike: 2, noshoot: 1, time: 10, winnerHF: 8 });
  $("#m-save").click();
  const stored = JSON.parse(w.localStorage.getItem("ipscMatches"));
  ok(stored.length === 1 && stored[0].stages.length === 2 && stored[0].division === "Production", "Match mit 2 Stages gespeichert");
  ok(/Wo die Punkte verloren gehen/.test($("#match-content").textContent) && $$(".loss-row").length === 5, "Auswertung mit Punktverlust-Balken");
  ok($(".loss-bar span").dataset.barWidth.endsWith("%") && $(".loss-bar span").style.width.endsWith("%"), "Punktverlust-Balken transportieren die Breite über data-bar-width statt über ein style=\"\"-Attribut (CSP: style-src 'self' ohne unsafe-inline), und die Breite wird trotzdem per JS gesetzt");
  ok($$(".score-table tbody tr")[0].textContent.includes("Stage 2"), "schwächste Stage steht oben");
  ok($$(".advice-drill").length >= 1 && /Misses/.test($("#match-content").textContent), "Empfehlung passt zum größten Verlust (Misses)");
  $$(".stage-sketch")[0].click();
  ok($("#match-overlay").classList.contains("hidden") && $("#detail-content h2").textContent === "El Presidente", "Link zur Skizze öffnet die Übung");
  E("closeDetail")();

  const speed = E("analyzeMatch")(E("sanitizeMatch")({ name: "x", date: "2026-09-01", stages: [{ alpha: 20, charlie: 1, time: 15, winnerHF: 10 }] }));
  ok(speed.focus === "speed", "hohe Trefferquote, aber weit hinter dem Sieger: Fokus Tempo");

  $("#matches-btn").click();
  $$(".journal-item")[0].click();
  $("#m-edit").click();
  ok($$(".stage-card").length === 2, "Bearbeiten zeigt die Stages");
  $$(".stage-remove")[1].click();
  $("#m-save").click();
  ok(JSON.parse(w.localStorage.getItem("ipscMatches"))[0].stages.length === 1, "Stage entfernen und speichern");
  $("#m-edit").click(); $("#m-delete").click();
  ok(JSON.parse(w.localStorage.getItem("ipscMatches")).length === 0, "Match löschen");
  ok(!$("#undo-toast").classList.contains("hidden") && /Vienna Open/.test($("#undo-toast-text").textContent), "Rückgängig-Hinweis nennt das gelöschte Match");
  E("performUndo")();
  ok(JSON.parse(w.localStorage.getItem("ipscMatches")).length === 1 && $("#undo-toast").classList.contains("hidden"), "Rückgängig stellt das Match wieder her");
  E("closeMatches")();
  ok(E("bodyScrollLockCount") === 0, "Scroll-Sperre nach Matches aufgehoben");
}

async function testPlans() {
  section("Trainingspläne");
  let { w, E, $, $$ } = boot();
  $("#plans-btn").click();
  ok($$(".plan-item").length === 3, "drei Vorlagen vorhanden");
  ok($(".plan-progress span").dataset.barWidth.endsWith("%") && $(".plan-progress span").style.width.endsWith("%"), "Plan-Fortschrittsbalken transportieren die Breite über data-bar-width statt über ein style=\"\"-Attribut (CSP: style-src 'self' ohne unsafe-inline), und die Breite wird trotzdem per JS gesetzt");
  const missingDrills = E("BUILTIN_PLANS").flatMap((pl) => pl.days.flatMap((d) => d.items.map((it) => it.drillId))).filter((id) => !E("DRILLS").some((d) => d.id === id));
  ok(missingDrills.length === 0, "alle Übungen der Vorlagen existieren");
  $$(".plan-item")[0].click();
  ok($$(".plan-day").length === 10, "Plan zeigt 10 Tage");
  $$(".plan-toggle")[0].click();
  ok(JSON.parse(w.localStorage.getItem("ipscPlanProgress"))["plan-dry-basics"].done[0] && /1 von 10/.test($(".plan-status").textContent), "Tag als erledigt markiert");
  $("#plan-to-journal").click();
  const sess = E("sessions");
  ok(sess.length === 1 && sess[0].type === "dry" && sess[0].drillIds.length === 2 && /Trockentraining Grundlagen/.test(sess[0].notes), "erledigter Tag ins Tagebuch übernommen");
  $$(".plan-toggle")[0].click();
  ok(!E("planProgress")["plan-dry-basics"].done[0], "Tag wieder als offen markieren");
  $$(".plan-drill")[0].click();
  ok($("#plans-overlay").classList.contains("hidden") && $("#detail-content h2"), "Übung aus dem Plan öffnen");
  E("closeDetail")();

  $("#plans-btn").click();
  $("#plan-new-btn").click();
  $("#pl-title").value = "Mein Plan";
  let day = $$("#pl-days > .plan-day")[0];
  day.querySelector(".pl-add-drill").value = "std-bill-drill"; day.querySelector(".pl-add-reps").value = "5×";
  day.querySelector(".pl-add-item").click();
  ok($("#pl-title").value === "Mein Plan" && $$(".plan-day-items li").length === 1, "Übung zum Tag hinzugefügt");
  $("#pl-add-day").click();
  day = $$("#pl-days > .plan-day")[1];
  day.querySelector(".pl-day-type").value = "live";
  day.querySelector(".pl-add-drill").value = "std-plates"; day.querySelector(".pl-add-item").click();
  $("#pl-save").click();
  const plans = JSON.parse(w.localStorage.getItem("ipscPlans"));
  ok(plans.length === 1 && plans[0].days.length === 2 && plans[0].days[0].items[0].reps === "5×" && plans[0].days[1].type === "live", "eigener Plan gespeichert");
  $("#plan-back").click();
  ok($$(".plan-item").length === 4, "eigener Plan erscheint in der Liste");
  $$(".plan-item")[3].click(); $("#plan-delete").click();
  ok(JSON.parse(w.localStorage.getItem("ipscPlans")).length === 0, "eigenen Plan löschen");
  ok(!$("#undo-toast").classList.contains("hidden") && /Mein Plan/.test($("#undo-toast-text").textContent), "Rückgängig-Hinweis nennt den gelöschten Plan");
  E("performUndo")();
  ok(JSON.parse(w.localStorage.getItem("ipscPlans")).length === 1, "Rückgängig stellt den Plan wieder her");
  $$(".plan-item")[3].click(); $("#plan-delete").click();
  E("hideUndoToast")();
  ok(JSON.parse(w.localStorage.getItem("ipscPlans")).length === 0, "geschlossener Hinweis macht die Löschung nicht rückgängig");
  E("closePlans")();
  ok(E("bodyScrollLockCount") === 0, "Scroll-Sperre nach Plänen aufgehoben");
}

async function testTrainingSuggestion() {
  section("Trainingsvorschlag auf der Startseite");

  let { w, E, $ } = boot();
  ok($("#training-suggestion").classList.contains("hidden"), "kein Vorschlag ohne Matches");

  // Match mit klarem Verlust-Schwerpunkt (viele Misses)
  const missMatch = {
    id: "m1", name: "Vienna Open", date: "2026-06-01", division: "", major: false, notes: "",
    stages: [{ id: "st1", name: "Stage 1", alpha: 5, charlie: 0, delta: 0, mike: 3, noshoot: 0, procedural: 0, time: 10, maxPoints: 0, winnerHF: 5 }]
  };
  ({ w, E, $ } = boot({ storage: { ipscMatches: [missMatch] } }));
  ok(!$("#training-suggestion").classList.contains("hidden") && /Misses/.test($("#training-suggestion-text").textContent), "Vorschlag nennt den Verlust-Schwerpunkt (Misses)");
  $("#training-suggestion-open").click();
  ok(!$("#detail-overlay").classList.contains("hidden") && $("#detail-content h2"), "„Öffnen“ zeigt die vorgeschlagene Übung");
  E("closeDetail")();

  // Schließen merkt sich das für den heutigen Tag
  ({ w, E, $ } = boot({ storage: { ipscMatches: [missMatch] } }));
  $("#training-suggestion-close").click();
  ok($("#training-suggestion").classList.contains("hidden"), "Hinweis lässt sich schließen");
  const dismissedDate = w.localStorage.getItem("ipscTrainingSuggestionDismissedDate");
  ({ w, E, $ } = boot({ storage: { ipscMatches: [missMatch] }, beforeApp: (win) => win.localStorage.setItem("ipscTrainingSuggestionDismissedDate", dismissedDate) }));
  ok($("#training-suggestion").classList.contains("hidden"), "bleibt für den Rest des Tages ausgeblendet");

  // Kein klarer Schwerpunkt (fast perfekte Stage) -> kein Vorschlag
  const perfectMatch = {
    id: "m2", name: "Perfekt", date: "2026-06-01", division: "", major: false, notes: "",
    stages: [{ id: "st1", name: "Stage 1", alpha: 10, charlie: 0, delta: 0, mike: 0, noshoot: 0, procedural: 0, time: 8, maxPoints: 0, winnerHF: 6.25 }]
  };
  ({ w, E, $ } = boot({ storage: { ipscMatches: [perfectMatch] } }));
  ok($("#training-suggestion").classList.contains("hidden"), "ohne klaren Verlust-Schwerpunkt gibt es keinen Vorschlag");
}

async function testStats() {
  section("Statistik");
  let { w, E, $ } = boot();
  $("#stats-btn").click();
  ok(!$("#stats-overlay").classList.contains("hidden"), "Statistik öffnet sich");
  ok(/Noch keine Trainingsdaten erfasst/.test($("#stats-content").textContent), "leerer Zustand zeigt Hinweis");
  E("closeStats")();
  ok(E("bodyScrollLockCount") === 0, "Scroll-Sperre nach Statistik aufgehoben (leer)");

  const statsScoreLogs = {
    "std-el-presidente": [
      { date: "2026-05-01T10:00:00.000Z", alpha: 7, charlie: 3, delta: 0, mike: 0, noshoot: 0, procedural: 0, time: 6.2, major: false, points: 44, hitFactor: 7.1 },
      { date: "2026-06-01T10:00:00.000Z", alpha: 8, charlie: 2, delta: 0, mike: 0, noshoot: 0, procedural: 0, time: 6, major: false, points: 46, hitFactor: 7.6 }
    ],
    "std-bill-drill": [
      { date: "2026-07-10T10:00:00.000Z", alpha: 5, charlie: 1, delta: 0, mike: 0, noshoot: 0, procedural: 0, time: 3, major: false, points: 28, hitFactor: 9.3 }
    ]
  };
  const statsSessions = [
    { id: "s1", date: "2026-05-01", type: "live", location: "Verein", rounds: 40, minutes: 60, drillIds: ["std-el-presidente"], notes: "" },
    { id: "s2", date: "2026-06-01", type: "live", location: "Verein", rounds: 50, minutes: 60, drillIds: ["std-el-presidente"], notes: "" },
    { id: "s3", date: "2026-07-10", type: "dry", location: "", rounds: 0, minutes: 20, drillIds: ["std-bill-drill"], notes: "" }
  ];
  const statsMatches = [{ id: "m1", name: "Vienna Open", date: "2026-06-15", division: "", major: false, notes: "", stages: [] }];
  ({ w, E, $ } = boot({ storage: { ipscScoreLogs: statsScoreLogs, ipscSessions: statsSessions, ipscMatches: statsMatches } }));
  $("#stats-btn").click();
  const values = [...w.document.querySelectorAll("#stats-content .stat-box .value")].map((el) => el.textContent);
  ok(values.join(",") === "3,90,3,1", "Übersichtskarten: Einheiten/Munition/Ergebnisse/Matches stimmen");
  ok(/A-Quote im Verlauf/.test($("#stats-content").textContent) && $("#stats-content svg"), "A-Quote-Verlauf wird gezeichnet, wenn genug Ergebnisse da sind");
  ok(/Mai 2026/.test($("#stats-content").textContent) && /Jun 2026/.test($("#stats-content").textContent) && /Jul 2026/.test($("#stats-content").textContent), "Trainingshäufigkeit zeigt die Monate mit Einheiten");
  ok(/El Presidente/.test($("#stats-content").textContent) && /Bill Drill/.test($("#stats-content").textContent), "meistgeübte Übungen werden gelistet");
  ok(/Zielwechsel/.test($("#stats-content").textContent), "Kategorie-Verteilung wird gelistet");
  ok($(".loss-bar span").dataset.barWidth.endsWith("%"), "Statistik-Balken transportieren die Breite über data-bar-width statt über ein style=\"\"-Attribut (CSP: style-src 'self' ohne unsafe-inline)");
  ok($(".loss-bar span").style.width.endsWith("%"), "Balkenbreite wird per JS gesetzt (data-bar-width → style.width)");
  E("closeStats")();
  ok(E("bodyScrollLockCount") === 0, "Scroll-Sperre nach Statistik aufgehoben (mit Daten)");

  // Nur ein Ergebnis: A-Quote-Verlauf wird nicht gezeichnet (Chart braucht mindestens 2)
  ({ w, E, $ } = boot({ storage: { ipscScoreLogs: { "std-bill-drill": statsScoreLogs["std-bill-drill"] } } }));
  $("#stats-btn").click();
  ok(!/A-Quote im Verlauf/.test($("#stats-content").textContent) && !$("#stats-content svg"), "A-Quote-Verlauf bleibt bei nur einem Ergebnis aus");

  // Trainingsserie: Wochen (Montag-Sonntag, UTC) relativ zu "jetzt", damit der Test
  // unabhängig vom tatsächlichen Testdatum funktioniert.
  const dateKeyDaysAgo = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const sessionOn = (id, dateKey) => ({ id, date: dateKey, type: "dry", location: "", rounds: 0, minutes: 10, drillIds: [], notes: "" });

  ({ w, E, $ } = boot());
  ok(E("trainingStreakWeeks")() === 0, "keine Serie ohne Trainingseinheiten");

  ({ w, E, $ } = boot({ storage: { ipscSessions: [sessionOn("s1", dateKeyDaysAgo(0))] } }));
  ok(E("trainingStreakWeeks")() === 1, "eine Einheit diese Woche: Serie von 1 Woche");
  $("#stats-btn").click();
  ok(/1 Woche in Folge/.test($("#stats-content").textContent), "Statistik zeigt die Serie (Einzahl)");

  ({ w, E, $ } = boot({ storage: { ipscSessions: [
    sessionOn("s1", dateKeyDaysAgo(0)), sessionOn("s2", dateKeyDaysAgo(7)), sessionOn("s3", dateKeyDaysAgo(14))
  ] } }));
  ok(E("trainingStreakWeeks")() === 3, "drei aufeinanderfolgende Wochen: Serie von 3");
  $("#stats-btn").click();
  ok(/3 Wochen in Folge/.test($("#stats-content").textContent), "Statistik zeigt die Serie (Mehrzahl)");

  // Diese Woche noch nicht trainiert, aber letzte Woche schon: Serie gilt noch als aktuell
  ({ w, E, $ } = boot({ storage: { ipscSessions: [sessionOn("s1", dateKeyDaysAgo(7)), sessionOn("s2", dateKeyDaysAgo(14))] } }));
  ok(E("trainingStreakWeeks")() === 2, "diese Woche noch nichts, aber letzte 2 Wochen: Serie bleibt aktuell");

  // Lücke von über einer Woche: Serie ist abgebrochen, egal wie lang sie mal war
  ({ w, E, $ } = boot({ storage: { ipscSessions: [sessionOn("s1", dateKeyDaysAgo(21)), sessionOn("s2", dateKeyDaysAgo(28))] } }));
  ok(E("trainingStreakWeeks")() === 0, "über eine Woche Pause: Serie abgebrochen");
  $("#stats-btn").click();
  ok(!/in Folge/.test($("#stats-content").textContent), "abgebrochene Serie erscheint nicht in der Statistik");
}

async function testGoals() {
  section("Ziel-Hit-Factor je Übung");
  let { w, E, $ } = boot();
  const presi = E("DRILLS").find((d) => d.id === "std-el-presidente");
  E("openDetail")(presi);
  ok($("#score-goal-input").value === "" && $("#score-goal-save").textContent === "Setzen" && !$("#score-goal-clear"), "noch kein Ziel gesetzt: leeres Feld, „Setzen“, kein Entfernen-Button");

  $("#score-goal-input").value = "8"; $("#score-goal-save").click();
  ok(E("goals")["std-el-presidente"] === 8 && $("#score-goal-input").value === "8.00" && $("#score-goal-save").textContent === "Ändern" && $("#score-goal-clear"), "Ziel gesetzt und gespeichert");
  ok(JSON.parse(w.localStorage.getItem("ipscGoals"))["std-el-presidente"] === 8, "Ziel landet im lokalen Speicher");
  ok(!$(".score-goal ~ .loss-bars"), "ohne Ergebnisse noch kein Fortschrittsbalken");

  const fill = { alpha: "8", charlie: "2", delta: "0", mike: "0", procedural: "0", time: "5" };
  for (const [k, v] of Object.entries(fill)) { const el = $(`#score-${k}`); if (el) el.value = v; }
  $("#score-add-btn").click();
  ok(Math.abs(E("goals")["std-el-presidente"] - 8) < 1e-9, "Ziel bleibt nach dem Eintragen eines Ergebnisses erhalten");
  ok($(".loss-bar span").dataset.barWidth.endsWith("%") && $(".loss-bar span").style.width.endsWith("%"), "Fortschrittsbalken nutzt data-bar-width (CSP-kompatibel), Breite trotzdem per JS gesetzt");
  ok(/9\.20 \/ 8\.00/.test($(".loss-value").textContent) && /✓/.test($(".loss-label").textContent), "Bestwert über dem Ziel wird als erreicht markiert (Minor: 8A+2C = 46 Punkte / 5 s = HF 9.2)");

  $("#score-goal-clear").click();
  ok(!("std-el-presidente" in E("goals")) && $("#score-goal-input").value === "" && !$("#score-goal-clear"), "Ziel entfernen löscht es wieder");
  E("closeDetail")();

  // In der Statistik erscheinen alle gesetzten Ziele mit Fortschritt
  ({ w, E, $ } = boot({ storage: {
    ipscGoals: { "std-el-presidente": 10, "std-bill-drill": 9 },
    ipscScoreLogs: {
      "std-el-presidente": [{ date: "2026-06-01T10:00:00.000Z", alpha: 8, charlie: 2, delta: 0, mike: 0, noshoot: 0, procedural: 0, time: 5, major: false, points: 46, hitFactor: 9.2 }]
    }
  } }));
  $("#stats-btn").click();
  ok(/Zielwerte/.test($("#stats-content").textContent) && /El Presidente/.test($("#stats-content").textContent) && /Bill Drill/.test($("#stats-content").textContent), "Statistik listet alle Übungen mit Zielwert");
  ok(/0\.00 \/ 9\.00/.test($("#stats-content").textContent), "Übung ohne eigene Ergebnisse zeigt Bestwert 0");
  E("closeStats")();

  // Ungültige/gelöschte Eingaben werden robust verworfen
  ({ w, E, $ } = boot());
  ok(JSON.stringify(E("sanitizeGoals")({ "std-bill-drill": "abc", "std-plates": -1, "__proto__": 5, "std-el-presidente": 7.5 })) === JSON.stringify({ "std-plates": 0.0001, "std-el-presidente": 7.5 }), "sanitizeGoals verwirft Unsinn, __proto__ und begrenzt den Wertebereich");
}

async function testMicrophone() {
  section("Schusserkennung per Mikrofon");
  const { w: w0, E: E0 } = boot();
  const rate = 48000;
  const signal = (clicks, amp = 0.8, seconds = 1) => {
    const arr = new Float32Array(rate * seconds);
    let seed = 1;
    for (let i = 0; i < arr.length; i++) { seed = (seed * 16807) % 2147483647; arr[i] = (seed / 2147483647 - 0.5) * 0.002; }
    for (const t of clicks) { const i = Math.round(t * rate); for (let k = 0; k < 40; k++) arr[i + k] += amp * Math.exp(-k / 8) * (k % 2 ? -1 : 1); }
    return arr;
  };
  let det = E0("createShotDetector")({ sampleRate: rate, sensitivity: 6 });
  let shots = det.process(signal([0.3, 0.55]), 0);
  ok(shots.length === 2 && Math.abs(shots[0] - 0.3) < 0.002 && Math.abs(shots[1] - 0.55) < 0.002, `zwei Klicks erkannt (${shots.map((t) => t.toFixed(3)).join(", ")} s)`);
  det = E0("createShotDetector")({ sampleRate: rate, sensitivity: 6 });
  ok(det.process(signal([0.3, 0.35]), 0).length === 1, "Echo innerhalb von 120 ms zählt nicht doppelt");
  ok(E0("createShotDetector")({ sampleRate: rate, sensitivity: 1 }).process(signal([0.3], 0.15), 0).length === 0 &&
     E0("createShotDetector")({ sampleRate: rate, sensitivity: 10 }).process(signal([0.3], 0.15), 0).length === 1, "Empfindlichkeit wirkt (leiser Klick nur bei hoher Empfindlichkeit)");
  ok(E0("createShotDetector")({ sampleRate: rate, sensitivity: 6 }).process(signal([]), 0).length === 0, "Grundrauschen löst nichts aus");

  let processor = null, trackStopped = false, deny = false;
  const fakeAudio = (win) => {
    class FakeCtx {
      constructor() { this.sampleRate = rate; this.state = "running"; this.destination = {}; this.t0 = Date.now(); }
      get currentTime() { return (Date.now() - this.t0) / 1000; }
      resume() {}
      createOscillator() { return { type: "", frequency: {}, connect() {}, start() {}, stop() {} }; }
      createGain() { return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() { processor = { connect() {}, disconnect() {}, onaudioprocess: null }; return processor; }
    }
    win.AudioContext = FakeCtx;
    Object.defineProperty(win.navigator, "mediaDevices", { value: {
      getUserMedia: async () => { if (deny) throw new Error("NotAllowedError"); return { getTracks: () => [{ stop: () => { trackStopped = true; } }] }; }
    }, configurable: true });
  };
  const { w, E, $ } = boot({ beforeApp: fakeAudio });
  E("openDetail")(E("DRILLS").find((d) => d.id === "std-bill-drill"));
  const sel = $("#timer-delay"); const opt = w.document.createElement("option"); opt.value = "0.1-0.1"; sel.appendChild(opt); sel.value = "0.1-0.1";
  $("#timer-par").value = "0.3"; $("#timer-mic").checked = true;
  $("#timer-start").click();
  await sleep(40);
  ok(E("parTimer").mic && /wartet auf Schüsse/.test($("#timer-shots").textContent), "Mikrofon aktiv, Anzeige wartet auf Schüsse");
  const t0 = E("parTimer").startAudio;
  E("handleMicShot")(t0 + 0.1);
  E("handleMicShot")(t0 + 0.35);
  ok(E("parTimer").shots.length === 0, "eigene Start- und Par-Töne werden ignoriert");
  const buf = signal([0.2, 0.5], 0.8, 1);
  await sleep(Math.max(0, (t0 + 0.8 - E("parTimer").ctx.currentTime) * 1000) + 20);
  processor.onaudioprocess({ inputBuffer: { getChannelData: () => buf }, playbackTime: t0 + 1.8 });
  ok(E("parTimer").shots.length === 2 && E("parTimer").shots[0] === 1 && E("parTimer").shots[1] === 1.3, "Schüsse über den Audiostrom erkannt: " + E("parTimer").shots.join(" s, ") + " s");
  ok(/2 Schuss, erster 1\.00 s, Splits Ø 0\.30 s/.test($("#timer-shots").textContent), "Anzeige mit erstem Schuss und Split");
  await sleep(2700);
  ok(!$("#timer-start").disabled && trackStopped && !E("parTimer").mic, "nach dem Timer wird das Mikrofon freigegeben");
  ok($("#timer-display").textContent === "1.30 s" && !$("#timer-take-time").classList.contains("hidden"), "Ergebnis: Zeit des letzten Schusses");
  $("#timer-take-time").click();
  ok($("#score-time").value === "1.30" && w.document.activeElement === $("#score-alpha"), "Zeit wird ins Ergebnis übernommen");

  deny = true;
  $("#timer-par").value = "0.2";
  $("#timer-start").click();
  await sleep(60);
  ok(/Mikrofon nicht verfügbar/.test($("#timer-sub").textContent) || /Ohne Mikrofon/.test($("#timer-display").textContent), "ohne Mikrofon-Freigabe läuft der Timer mit Hinweis");
  E("closeDetail")();

  $("#settings-btn").click();
  $("#set-mic").value = "9"; $("#settings-save").click();
  ok(E("settings").micSensitivity === 9, "Empfindlichkeit in den Einstellungen gespeichert");
}

async function testInstallAndExportReminder() {
  section("App-Installation, Export-Erinnerung");

  // Installations-Banner: erscheint erst, wenn der Browser beforeinstallprompt feuert
  let { w, E, $ } = boot();
  ok($("#install-banner").classList.contains("hidden"), "kein Installations-Hinweis ohne beforeinstallprompt");
  let prompted = false, choiceAsked = false;
  const evt = Object.assign(new w.Event("beforeinstallprompt", { cancelable: true }), {
    prompt: () => { prompted = true; },
    userChoice: (async () => { choiceAsked = true; return { outcome: "accepted" }; })()
  });
  w.dispatchEvent(evt);
  ok(!$("#install-banner").classList.contains("hidden"), "beforeinstallprompt zeigt den Installations-Hinweis");
  ok(evt.defaultPrevented, "Standard-Installationsdialog des Browsers wird unterdrückt (eigener Button steuert ihn)");
  $("#install-btn").click(); await sleep(20);
  ok(prompted && choiceAsked, "Installieren-Button löst den Browser-Installationsdialog aus");
  ok($("#install-banner").classList.contains("hidden"), "Hinweis verschwindet nach der Installation");

  ({ w, E, $ } = boot());
  w.dispatchEvent(Object.assign(new w.Event("beforeinstallprompt", { cancelable: true }), { prompt: () => {}, userChoice: Promise.resolve({}) }));
  $("#install-banner-close").click();
  ok($("#install-banner").classList.contains("hidden"), "Hinweis lässt sich auch ohne Installieren schließen");

  // Export-Erinnerung: nur wenn es etwas zu sichern gibt, und erst ab EXPORT_REMINDER_DAYS
  ({ w, E, $ } = boot());
  ok($("#export-reminder-banner").classList.contains("hidden"), "kein Erinnerungs-Hinweis ohne jegliche Daten");

  ({ w, E, $ } = boot({ storage: { ipscSessions: [{ id: "s1", date: "2026-01-01", type: "live", location: "", rounds: 10, minutes: 10, drillIds: [], notes: "" }] } }));
  ok(!$("#export-reminder-banner").classList.contains("hidden") && /noch nie exportiert/.test($("#export-reminder-text").textContent), "mit Daten, aber noch nie exportiert: Hinweis erscheint");

  const recent = new Date(Date.now() - 3 * 86400000).toISOString();
  ({ w, E, $ } = boot({
    storage: { ipscSessions: [{ id: "s1", date: "2026-01-01", type: "live", location: "", rounds: 10, minutes: 10, drillIds: [], notes: "" }] },
    beforeApp: (win) => win.localStorage.setItem("ipscLastExportAt", recent)
  }));
  ok($("#export-reminder-banner").classList.contains("hidden"), "vor Ablauf der Frist (3 von 10 Tagen): kein Hinweis");

  const overdue = new Date(Date.now() - 11 * 86400000).toISOString();
  ({ w, E, $ } = boot({
    storage: { ipscSessions: [{ id: "s1", date: "2026-01-01", type: "live", location: "", rounds: 10, minutes: 10, drillIds: [], notes: "" }] },
    beforeApp: (win) => win.localStorage.setItem("ipscLastExportAt", overdue)
  }));
  ok(!$("#export-reminder-banner").classList.contains("hidden") && /11 Tage her/.test($("#export-reminder-text").textContent), "nach Ablauf der Frist (11 Tage): Hinweis mit Tagesangabe");
  $("#export-reminder-close").click();
  ok($("#export-reminder-banner").classList.contains("hidden"), "Erinnerung lässt sich schließen");

  // exportAll() merkt sich den Zeitpunkt und blendet eine offene Erinnerung aus
  ({ w, E, $ } = boot({
    storage: { ipscSessions: [{ id: "s1", date: "2026-01-01", type: "live", location: "", rounds: 10, minutes: 10, drillIds: [], notes: "" }] },
    beforeApp: (win) => win.localStorage.setItem("ipscLastExportAt", overdue)
  }));
  ok(!$("#export-reminder-banner").classList.contains("hidden"), "Hinweis vor dem Export sichtbar");
  w.__t("downloadJSON = () => {}");
  E("exportAll")();
  ok($("#export-reminder-banner").classList.contains("hidden"), "Export blendet die Erinnerung aus");
  const stored = new Date(w.localStorage.getItem("ipscLastExportAt"));
  ok(Date.now() - stored.getTime() < 5000, "Export-Zeitpunkt wird gespeichert");
}

async function testUpdateBanner() {
  section("Update-Hinweis");
  const fakeServiceWorker = (swVersion) => (w) => {
    const target = new w.EventTarget();
    target.controller = {
      postMessage: (msg) => {
        if (msg === "version") setTimeout(() => target.dispatchEvent(Object.assign(new w.Event("message"), { data: { type: "version", version: swVersion } })), 0);
      }
    };
    target.register = () => Promise.resolve({ update: () => Promise.resolve() });
    Object.defineProperty(w.navigator, "serviceWorker", { value: target, configurable: true });
  };
  let { w, E, $ } = boot({ beforeApp: fakeServiceWorker("1999.01.1") });
  if (w.document.readyState !== "complete") w.dispatchEvent(new w.Event("load"));
  await sleep(50);
  ok(!$("#update-banner").classList.contains("hidden"), "abweichende Version zeigt „Neu laden“-Hinweis");

  const appVersion = /const APP_VERSION = "([^"]+)"/.exec(read("app.js"))[1];
  ({ w, E, $ } = boot({ beforeApp: fakeServiceWorker(appVersion) }));
  if (w.document.readyState !== "complete") w.dispatchEvent(new w.Event("load"));
  await sleep(50);
  ok($("#update-banner").classList.contains("hidden"), "gleiche Version zeigt keinen Hinweis");
  const swVersion = /const VERSION = "([^"]+)"/.exec(read("sw.js"))[1];
  ok(swVersion === appVersion, `Versionsnummern in app.js und sw.js stimmen überein (${appVersion})`);
}

async function testServiceWorker() {
  section("Service Worker");
  const listeners = {}; const store = new Map(); let fetchImpl;
  const cache = { match: async (r) => store.get(typeof r === "string" ? r : r.url), put: async (r, res) => store.set(r.url, res), addAll: async () => {} };
  const sandbox = {
    self: { location: { origin: "https://x.io" }, addEventListener: (t, f) => (listeners[t] = f), skipWaiting() {}, clients: { claim() {} } },
    caches: { open: async () => cache, keys: async () => [], delete: async () => true },
    fetch: (r) => fetchImpl(r), URL, Response, Promise, setTimeout
  };
  new Function(...Object.keys(sandbox), read("sw.js"))(...Object.values(sandbox));
  const res = (okFlag, body) => ({ ok: okFlag, type: "basic", body, clone() { return this; } });
  const run = (url, mode = "no-cors") => { let p; listeners.fetch({ request: { method: "GET", url, mode }, respondWith: (x) => (p = x) }); return p; };

  const assets = /const ASSETS = \[([\s\S]*?)\]/.exec(read("sw.js"))[1].match(/"([^"]+)"/g).map((s) => s.slice(1, -1)).filter((a) => a !== "./");
  ok(assets.every((a) => fs.existsSync(path.join(ROOT, a))), "alle Dateien der Offline-Liste existieren im Repo: " + assets.join(", "));

  fetchImpl = async () => res(true, "neu");
  ok((await run("https://x.io/app.js")).body === "neu", "online: neue Version");
  fetchImpl = async () => { throw new Error("offline"); };
  ok((await run("https://x.io/app.js")).body === "neu", "offline: Version aus dem Cache");
  fetchImpl = async () => res(false, "404");
  await run("https://x.io/fehlt.js");
  ok(!store.has("https://x.io/fehlt.js"), "Fehlerseiten werden nicht gecacht");
  store.set("index.html", res(true, "index")); fetchImpl = async () => { throw new Error("offline"); };
  ok((await run("https://x.io/ipsc-training/xyz", "navigate")).body === "index", "offline: Startseite als Fallback");

  let reply = null;
  listeners.message({ data: "version", source: { postMessage: (m) => (reply = m) } });
  ok(reply && reply.type === "version" && reply.version, "Service Worker meldet seine Version");
}

async function testBriefingJournalPrint() {
  section("Stagebriefing, Magazinplanung, CSV, Tagebuch, Druckvorlage, Design");
  const now = new Date().toISOString();
  const trickyDrill = { ...goodDrill, id: "custom-csv", title: "=HYPERLINK(\"x\")", category: "Test;Kategorie" };
  let { w, E, $, $$ } = boot({
    storage: {
      ipscCustomDrills: [trickyDrill],
      ipscScoreLogs: {
        "std-bill-drill": [{ date: now, alpha: 5, charlie: 1, delta: 0, mike: 0, noshoot: 0, procedural: 0, time: 2.5, major: false }],
        "custom-csv": [{ date: now, alpha: 2, charlie: 0, delta: 0, mike: 1, noshoot: 0, procedural: 0, time: 1.25, major: true }]
      }
    }
  });

  ok(E("courseTypeFor")(12) === "Short Course" && E("courseTypeFor")(13) === "Medium Course" && E("courseTypeFor")(32) === "Long Course", "Kursart nach Schusszahl (12/24/32)");
  ok(E("minReloads")(16, 15, true) === 0 && E("minReloads")(32, 15, true) === 2 && E("minReloads")(17, 15, false) === 1, "Magazinwechsel werden richtig berechnet");
  const plates = E("layoutTargetSummary")(E("DRILLS").find((d) => d.id === "std-plates").layout);
  ok(plates.rounds === 6 && plates.plate === 6 && plates.paper === 0, "Schusszahl aus Skizze: 6 Plates = 6 Schuss");
  const popper = E("layoutTargetSummary")(E("DRILLS").find((d) => d.id === "std-popper-paper").layout);
  ok(popper.rounds === 5 && popper.paper === 2 && popper.popper === 1, "Schusszahl aus Skizze: 2 Papier + 1 Popper = 5 Schuss");

  E("openDetail")(E("DRILLS").find((d) => d.id === "std-el-presidente"));
  ok($(".briefing") && $$(".briefing-cell").length === 4 && $$(".briefing-value")[0].textContent === "3", "Briefing zeigt Symbole und Anzahl der Ziele");
  ok(/12 Schuss \(Skizze: mind\. 6\)/.test($(".briefing-head").textContent) && /Short Course/.test($(".briefing-head").textContent), "Briefing: Schusszahl, Mindestschusszahl, Kursart");
  ok(/Ohne Magazinwechsel/.test($(".briefing-foot").textContent), "Briefing: 12 Schuss ohne Wechsel bei 15+1");
  E("closeDetail")();

  E("openCreate")();
  w.document.querySelector('.tool-select[data-tool="target"]').click();
  E("placeAtPoint")({ x: 100, y: 100 });
  w.document.querySelector('.tool-select[data-tool="steel"]').click();
  E("placeAtPoint")({ x: 200, y: 100 });
  ok(/mind\. 3 Schuss/.test($("#builder-summary").textContent), "Editor zeigt Schusszahl live: " + $("#builder-summary").textContent.trim().replace(/\s+/g, " "));
  $("#builder-take-rounds").click();
  ok($("#f-rounds").value === "3", "„Schusszahl übernehmen“ füllt das Formular");
  E("closeCreate")();

  const csv = E("buildScoresCsv")();
  const lines = csv.slice(1).split("\r\n");
  ok(csv.charCodeAt(0) === 0xfeff && lines[0].startsWith("Datum;Uhrzeit;Training;"), "CSV mit Kopfzeile, Semikolon und Excel-Kennung");
  ok(lines.length === 3 && csv.includes(";2,50;Minor;") && csv.includes(";1,25;Major;"), "CSV mit Dezimalkomma und Power Factor");
  ok(csv.includes('"\'=HYPERLINK(""x"")"') && csv.includes('"Test;Kategorie"'), "CSV entschärft Formeln und maskiert Sonderzeichen");

  // Tagebuch
  $("#journal-btn").click();
  ok(!$("#journal-overlay").classList.contains("hidden") && /Noch keine Einheiten/.test($("#journal-content").textContent), "Tagebuch öffnet leer");
  $("#journal-new-btn").click();
  ok($("#j-date").value === E("localDateKey")(new Date()), "neue Einheit mit heutigem Datum");
  ok(/9 Schuss aus Ergebnissen/.test($("#j-suggestion").textContent), "Vorschlag: Schüsse aus den heutigen Ergebnissen");
  $("#j-take").click();
  $("#j-location").value = "Vereinsstand <Wien>";
  $$(".journal-drill input").find((cb) => cb.value === "std-bill-drill").checked = true;
  ok(/Bill Drill/.test($("#j-results").textContent), "Ergebnisse des Tages werden angezeigt");
  $("#j-save").click();
  let stored = JSON.parse(w.localStorage.getItem("ipscSessions"));
  ok(stored.length === 1 && stored[0].rounds === 9 && stored[0].drillIds[0] === "std-bill-drill" && stored[0].type === "live", "Einheit gespeichert (9 Schuss, 1 Übung)");
  ok($$(".journal-item").length === 1 && $("#journal-content").textContent.includes("Vereinsstand <Wien>") && $$(".journal-summary .value")[0].textContent === "9", "Liste und Monatssumme aktualisiert, Text sicher angezeigt");
  $$(".journal-item")[0].click();
  $("#j-type").value = "dry"; $("#j-type").dispatchEvent(new w.Event("change"));
  ok(w.document.querySelector(".j-rounds-field").classList.contains("hidden"), "Trockentraining blendet Munition aus");
  $("#j-save").click();
  stored = JSON.parse(w.localStorage.getItem("ipscSessions"));
  ok(stored[0].type === "dry" && stored[0].rounds === 0, "Trockentraining wird ohne Munition gespeichert");
  $$(".journal-item")[0].click(); $("#j-delete").click();
  ok(JSON.parse(w.localStorage.getItem("ipscSessions")).length === 0, "Einheit löschen");
  ok(!$("#undo-toast").classList.contains("hidden"), "Rückgängig-Hinweis nach dem Löschen der Einheit");
  E("performUndo")();
  ok(JSON.parse(w.localStorage.getItem("ipscSessions")).length === 1, "Rückgängig stellt die Trainingseinheit wieder her");
  $$(".journal-item")[0].click(); $("#j-delete").click(); E("hideUndoToast")();
  ok(JSON.parse(w.localStorage.getItem("ipscSessions")).length === 0, "wieder gelöscht (für die folgenden Export/Import-Prüfungen)");
  E("closeJournal")();
  ok(E("bodyScrollLockCount") === 0, "Scroll-Sperre nach Tagebuch aufgehoben");

  E("sessions").push(E("sanitizeSession")({ id: "session-1", date: "2026-09-01", type: "live", rounds: 50, drillIds: ["custom-csv", "std-plates"] }));
  E("exportIncludeScoresCheckbox").checked = true;
  let exported = null;
  w.__captureExport = (json) => { exported = json; };
  w.__t("downloadJSON = (content) => window.__captureExport(content)");
  E("exportAll")();
  const exp = JSON.parse(exported);
  ok(Array.isArray(exp.sessions) && exp.sessions.length === 1, "Export enthält das Tagebuch");

  ({ w, E, $, $$ } = boot());
  E("importFile")(new w.File([exported], "e.json")); await sleep(60);
  const imported = E("sessions")[0];
  const newCustom = E("customDrills")[0];
  ok(imported && imported.rounds === 50 && imported.drillIds.includes("std-plates") && imported.drillIds.includes(newCustom.id), "Import übernimmt Tagebuch und ordnet Übungen zu");

  // Druckvorlage
  $("#print-targets-btn").click();
  ok(/13,5 × 17,1 cm/.test($("#p-info").textContent) && /hochkant/.test($("#p-info").textContent), "3 m statt 10 m: Ziel 13,5 × 17,1 cm hochkant");
  $("#p-count").value = "2"; $("#p-count").dispatchEvent(new w.Event("change"));
  ok($("#p-print").disabled && /passt so nicht/.test($("#p-info").textContent), "zu große Ziele werden abgelehnt");
  $("#p-practice").value = "2"; $("#p-practice").dispatchEvent(new w.Event("input"));
  ok(!$("#p-print").disabled && /9,0 × 11,4 cm/.test($("#p-info").textContent), "2 m statt 10 m: 2 Ziele passen");
  let printed = false; w.print = () => { printed = true; };
  $("#p-print").click();
  const svgs = [...w.document.querySelectorAll("#print-sheet svg")];
  ok(printed && svgs.length === 2 && svgs[0].getAttribute("width") === "90.0mm" && svgs[0].getAttribute("height") === "114.0mm", "Druck: 2 Ziele in exakter Größe in mm");
  ok($("#print-sheet").classList.contains("a4-portrait") && $("#print-sheet .print-ruler-line"), "Druck: Seitenformat über Klasse (a4-portrait) und 10-cm-Kontrolllinie");
  E("closePrintTargets")();

  // Einstellungen: Magazin und Design
  $("#settings-btn").click();
  $("#set-magcap").value = "10"; $("#set-chamber").checked = false;
  $("#set-theme").value = "light"; $("#set-fontsize").value = "large";
  $("#settings-save").click();
  ok(w.document.documentElement.dataset.theme === "light" && w.document.documentElement.dataset.fontsize === "large", "heller Modus und große Schrift werden angewendet");
  ok(w.document.querySelector('meta[name="theme-color"]').getAttribute("content") === "#f4f5f7", "Statusleisten-Farbe passt zum hellen Modus");
  E("openDetail")(E("DRILLS").find((d) => d.id === "std-el-presidente"));
  ok(/Mindestens 1 Magazinwechsel bei 10 Schuss/.test($(".briefing-foot").textContent), "Magazinplanung nutzt die Einstellungen");
  E("closeDetail")();

  ({ w, E, $ } = boot({
    storage: { ipscSettings: { theme: "system" } },
    beforeApp: (win) => { win.matchMedia = () => ({ matches: true, addEventListener() {} }); }
  }));
  ok(w.document.documentElement.dataset.theme === "light", "Design „wie am Gerät“ folgt der Systemeinstellung");
}

async function testSecurityHardening() {
  section("Sicherheit: Escaping, Prototype-Schutz, Start-Fehler");
  let { w, E, $ } = boot();

  // escapeHtml() maskiert auch Anführungszeichen, sonst kann ein Wert mit " aus
  // einem HTML-Attribut ausbrechen (value="${escapeHtml(x)}").
  ok(E("escapeHtml")('"\'<>&') === "&quot;&#39;&lt;&gt;&amp;", "escapeHtml maskiert \" ' < > &");

  // Match-Formular: Name, Division, Notizen und Stage-Name sind freier Text ohne
  // Zeichen-Einschränkung – hier muss escapeHtml den Angriff abfangen.
  E("renderMatchForm")(null, { name: evilValue, date: "2026-01-01", division: evilValue, major: false, notes: evilValue, stages: [{ name: evilValue }] });
  ok(!$("#match-content [onerror]") && $("#m-name").value === evilValue && $("#m-division").value === evilValue && $(".stage-name").value === evilValue,
    "Match-Formular: Name/Division/Stage-Name brechen nicht aus dem Attribut aus");

  // Trainingsplan-Formular: Titel, Beschreibung, Tag-Name und Umfang
  E("renderPlanForm")(null, { title: evilValue, description: evilValue, days: [{ title: evilValue, type: "dry", items: [{ drillId: "std-bill-drill", reps: evilValue }] }] });
  ok(!$("#plans-content [onerror]") && $("#pl-title").value === evilValue && $(".pl-day-title").value === evilValue,
    "Plan-Formular: Titel/Tag-Name brechen nicht aus dem Attribut aus");

  // Tagebuch-Formular: Ort
  E("renderJournalForm")({ date: "2026-01-01", type: "live", location: evilValue, rounds: 0, minutes: 0, drillIds: [], notes: evilValue });
  ok(!$("#journal-content [onerror]") && $("#j-location").value === evilValue, "Tagebuch-Formular: Ort bricht nicht aus dem Attribut aus");

  // __proto__/constructor als Schlüssel aus localStorage oder Import dürfen das
  // Prototype der internen Maps nicht überschreiben (result[key] = wert).
  ({ w, E } = boot({
    storage: {
      ipscScoreLogs: JSON.parse('{"__proto__":[{"date":"2026-01-01T00:00:00.000Z","alpha":1,"time":1}]}'),
      ipscEditedBuiltins: JSON.parse('{"__proto__":{"title":"x","category":"y","procedure":"z"}}'),
      ipscPlanProgress: JSON.parse('{"__proto__":{"done":{"0":"2026-01-01"}}}')
    }
  }));
  // Vergleich gegen w.Object.prototype, nicht Object.prototype: jsdom führt app.js
  // in einer eigenen Realm aus, die ihr eigenes Object.prototype mitbringt.
  ok(Object.getPrototypeOf(E("scoreLogs")) === w.Object.prototype, "scoreLogs: __proto__-Schlüssel verändert das Prototype nicht");
  ok(Object.getPrototypeOf(E("editedBuiltins")) === w.Object.prototype, "editedBuiltins: __proto__-Schlüssel verändert das Prototype nicht");
  ok(Object.getPrototypeOf(E("planProgress")) === w.Object.prototype, "planProgress: __proto__-Schlüssel verändert das Prototype nicht");

  // Start-Fehler: ein Teil, der beim Start eine Ausnahme wirft, darf die übrigen
  // Teile nicht mitreißen (Ursache für die früheren Tab-/Stage-Editor-Ausfälle).
  ({ w, E, $ } = boot());
  ok($("#init-failure-warning").classList.contains("hidden"), "kein Hinweis, wenn beim Start alles funktioniert");
  let ranAfterFailure = false;
  E("safeInit")("Kaputter Teil", () => { throw new Error("kaputt"); });
  E("safeInit")("Teil danach", () => { ranAfterFailure = true; });
  ok(ranAfterFailure, "ein fehlschlagender Teil bricht die übrigen Teile nicht ab");
  E("showInitFailureWarning")();
  ok(!$("#init-failure-warning").classList.contains("hidden") && /Kaputter Teil/.test($("#init-failure-text").textContent),
    "Hinweisbalken nennt den fehlgeschlagenen Teil");
}

function testHtmlHardening() {
  section("HTML-Grundgerüst: CSP, Versionierung, Aufräumen");
  const html = read("index.html");
  ok(/<meta http-equiv="Content-Security-Policy" content="[^"]*default-src 'self'[^"]*script-src 'self'[^"]*style-src 'self'[^"]*">/.test(html),
    "Content-Security-Policy-Meta-Tag schränkt Skripte/Styles auf 'self' ein");
  ok(!/unsafe-inline|unsafe-eval/.test(html), "CSP erlaubt kein unsafe-inline/unsafe-eval");

  const appVersion = /const APP_VERSION = "([^"]+)"/.exec(read("app.js"))[1];
  const v = appVersion.replace(/\./g, "\\.");
  ok(new RegExp(`<script src="app\\.js\\?v=${v}">`).test(html), "app.js wird mit Versionsnummer geladen (Cache-Busting nach einem Update)");
  ok(new RegExp(`<script src="data/drills\\.js\\?v=${v}">`).test(html), "data/drills.js wird mit Versionsnummer geladen");
  ok(new RegExp(`<script src="lib/qrcode\\.js\\?v=${v}">`).test(html), "lib/qrcode.js wird mit Versionsnummer geladen");

  ok(fs.existsSync(path.join(ROOT, ".github/workflows/tests.yml")), "Test-Workflow für GitHub Actions ist vorhanden");
  ok(!fs.existsSync(path.join(ROOT, "Tests")), "alter, doppelter Tests-Ordner ist entfernt");
  ok(!fs.existsSync(path.join(ROOT, "artifact-index.html")), "artifact-index.html ist entfernt");
}

function testLicenseFiles() {
  section("Lizenz");
  const license = read("LICENSE");
  const notices = read("THIRD_PARTY_NOTICES.md");
  ok(/Alle Rechte vorbehalten/.test(license), "LICENSE: alle Rechte vorbehalten");
  const libFiles = fs.readdirSync(path.join(ROOT, "lib"));
  ok(libFiles.every((f) => notices.includes("lib/" + f)), "jede Datei in lib/ ist in THIRD_PARTY_NOTICES.md aufgeführt: " + libFiles.join(", "));
  ok(read("lib/qrcode.js").includes("Licensed under the MIT license"), "Lizenzhinweis in lib/qrcode.js ist intakt");
}

(async () => {
  for (const suite of [testScoringAndSecurity, testLibrarySearchFavorites, testSettingsStatsTimer, testSharingAndSketch, testMultiShare, testBriefingJournalPrint, testShotPlan, testPlanWalkthrough, testStageEditor, testMatches, testPlans, testTrainingSuggestion, testStats, testGoals, testMicrophone, testInstallAndExportReminder, testUpdateBanner, testServiceWorker, testSecurityHardening, testHtmlHardening, testLicenseFiles]) {
    try { await suite(); } catch (e) { failed++; console.log("  ✗ Testblock abgebrochen: " + (e && e.stack || e)); }
  }
  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  process.exit(failed ? 1 : 0);
})();
