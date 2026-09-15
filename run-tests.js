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
  ok(E("slugify")("Übergänge & Reloads") === "uebergaenge-reloads", "Dateinamen mit Umlauten");
}

async function testLibrarySearchFavorites() {
  section("Bibliothek, Suche, Favoriten");
  let { w, E, $, $$ } = boot();
  ok(E("DRILLS").length === 19 && $("#result-count").textContent === "19 von 19 Trainings", "19 Standard-Übungen geladen");
  let errors = 0;
  for (const d of E("DRILLS")) { try { E("openDetail")(d); if (!$("#detail-content svg")) errors++; } catch (e) { errors++; } }
  E("closeDetail")();
  ok(errors === 0 && E("bodyScrollLockCount") === 0, "alle Detailansichten rendern, Scroll-Sperre sauber");
  ok($$(".builder-toolbar .tool-icon svg").length === 4, "Werkzeugleiste zeigt Symbole für Target, Plate, Popper, No-Shoot");
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
  const { w, E, $ } = boot({ storage: { ipscScoreLogs: { "std-bill-drill": log } } });

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

(async () => {
  for (const suite of [testScoringAndSecurity, testLibrarySearchFavorites, testSettingsStatsTimer, testSharingAndSketch, testUpdateBanner, testServiceWorker]) {
    try { await suite(); } catch (e) { failed++; console.log("  ✗ Testblock abgebrochen: " + (e && e.stack || e)); }
  }
  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  process.exit(failed ? 1 : 0);
})();
