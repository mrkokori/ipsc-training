let DRILLS = [];
let customDrills = [];
let editedBuiltins = {};
let deletedBuiltinIds = [];
let scoreLogs = {};
let favorites = new Set();

// Versionsnummer der App. Bei jeder Veröffentlichung hier UND in sw.js erhöhen.
const APP_VERSION = "2026.09.5";

const CUSTOM_STORAGE_KEY = "ipscCustomDrills";
const EDITED_BUILTINS_KEY = "ipscEditedBuiltins";
const DELETED_BUILTINS_KEY = "ipscDeletedBuiltins";
const SCORE_LOG_KEY = "ipscScoreLogs";
const STORAGE_WARNING_KEY = "ipscStorageWarningDismissedV2";
const FAVORITES_KEY = "ipscFavorites";
const SETTINGS_KEY = "ipscSettings";

// Einstellungen
const TIMER_DELAYS = { "2-4": "zufällig 2–4 s", "1-3": "zufällig 1–3 s", "3-3": "fest 3 s" };
const DEFAULT_SETTINGS = { powerFactor: "minor", timerDelay: "2-4", timerReps: 1 };
let settings = { ...DEFAULT_SETTINGS };

// Erlaubte Werte für die Datenprüfung importierter/gespeicherter Trainings
const TARGET_TYPES = ["paper", "steel", "popper", "pendler", "updown", "noshoot"];
const PROP_TYPES = ["tisch", "sessel"];
const SKETCH_DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

// Zielsymbole (oben, weil die Werkzeugleiste schon beim Start gezeichnet wird)
const TARGET_TAN = "#c79c71";
const TARGET_STROKE = "#111111";
const STEEL_BLUE = "#5dc9f8";
const ICON_STROKE = "#111111";

// Maße eines Papierziels in der Skizze (halbe Breite / halbe Höhe)
const TARGET_HW = 22;
const TARGET_HH = 25;

// Umrisse als Anteile von halber Breite (x) und halber Höhe (y), abgenommen vom Stagebook-Symbol
const TARGET_OUTLINE = [[-0.34, -1], [0.34, -1], [1, -0.34], [1, 0.34], [0.34, 1], [-0.34, 1], [-1, 0.34], [-1, -0.34]];
const TARGET_C_ZONE = [[-0.36, -1], [-0.63, -0.34], [-0.63, 0.15], [-0.22, 0.57], [0.22, 0.57], [0.63, 0.15], [0.63, -0.34], [0.36, -1]];
const TARGET_A_ZONE = [[-0.12, -0.89], [-0.32, -0.36], [-0.32, 0], [-0.12, 0.23], [0.12, 0.23], [0.32, 0], [0.32, -0.36], [0.12, -0.89]];

// Par-Timer (Konstanten oben, weil init() beim Start schon darauf zugreift)
const PAR_RESET_MS = 4000;       // Pause zwischen zwei Durchgängen
const NO_PAR_RESET_MS = 8000;    // ohne Par-Zeit etwas mehr Zeit für die Übung
const parTimer = { ctx: null, token: 0, timeouts: [], nodes: [], rafId: 0, wakeLock: null, running: false };

// Teilen per Link
const SHARE_HASH_PREFIX = "#t=";
const MAX_SHARED_BYTES = 200000;

const state = { category: "", difficulty: "", equipment: "", search: "", favoritesOnly: false };

const grid = document.getElementById("drill-grid");
const resultCount = document.getElementById("result-count");
const catSelect = document.getElementById("filter-category");
const diffSelect = document.getElementById("filter-difficulty");
const equipSelect = document.getElementById("filter-equipment");
const resetBtn = document.getElementById("filter-reset");
const overlay = document.getElementById("detail-overlay");
const detailContent = document.getElementById("detail-content");
const closeBtn = document.getElementById("detail-close");

const addDrillBtn = document.getElementById("add-drill-btn");
const createOverlay = document.getElementById("create-overlay");
const createClose = document.getElementById("create-close");
const createCancel = document.getElementById("create-cancel");
const createForm = document.getElementById("create-form");
const createTitleEl = document.getElementById("create-title");
const saveBtn = document.getElementById("save-btn");
const builderSvg = document.getElementById("builder-svg");
const builderHint = document.getElementById("builder-hint");

const restoreBuiltinsBtn = document.getElementById("restore-builtins-btn");
const exportBtn = document.getElementById("export-btn");
const exportIncludeScoresCheckbox = document.getElementById("export-include-scores");
const importBtn = document.getElementById("import-btn");
const importFileInput = document.getElementById("import-file-input");
const dbToolsMsg = document.getElementById("db-tools-msg");

const storageWarning = document.getElementById("storage-warning");
const storageWarningClose = document.getElementById("storage-warning-close");

function emptyBuilderLayout() {
  return { viewW: 400, viewH: 500, targets: [], shooterPositions: [], walls: [], boxes: [], props: [], path: [] };
}

let builderLayout = emptyBuilderLayout();
let builderTool = "target";
let pendingPoint = null;
let historyStack = [];
let dragState = null;
let pointerDownPoint = null;
let didDrag = false;

let editingDrillId = null;
let editingIsCustom = false;
let equipmentSelected = new Set();

const TOOL_HINTS = {
  target: "Klicke in die Fläche, um ein Target zu platzieren.",
  steel: "Klicke in die Fläche, um eine Plate zu platzieren.",
  popper: "Klicke in die Fläche, um einen Popper zu platzieren.",
  pendler: "Klicke, um einen Pendler (Swinger) zu platzieren.",
  updown: "Klicke, um ein Up-Down-Ziel zu platzieren.",
  noshoot: "Klicke in die Fläche, um ein No-Shoot-Ziel zu platzieren.",
  shooter: "Klicke, um eine Schützenposition zu platzieren. Mit \"Schütze drehen\" die Blickrichtung ändern.",
  wall: "Erster Klick = Anfang der Wand, zweiter Klick = Ende der Wand.",
  box: "Erster Klick = eine Ecke der Box, zweiter Klick = gegenüberliegende Ecke.",
  tisch: "Klicke, um einen Tisch zu platzieren.",
  sessel: "Klicke, um einen Sessel zu platzieren.",
  delete: "Klicke auf ein Element, um es zu löschen."
};
const DRAG_HINT = " Bereits gesetzte Elemente kannst du direkt anfassen und verschieben.";

init();

async function init() {
  customDrills = sanitizeStoredCustomDrills(loadJSON(CUSTOM_STORAGE_KEY, []));
  editedBuiltins = sanitizeStoredEditedBuiltins(loadJSON(EDITED_BUILTINS_KEY, {}));
  deletedBuiltinIds = cleanArr(loadJSON(DELETED_BUILTINS_KEY, []), 5000).filter(id => typeof id === "string");
  const rawScoreLogs = loadJSON(SCORE_LOG_KEY, {});
  scoreLogs = sanitizeScoreLogs(rawScoreLogs);
  // Speichert nur, wenn sich etwas geändert hat (z.B. Neuberechnung alter Einträge ohne Miss-Abzug)
  if (JSON.stringify(scoreLogs) !== JSON.stringify(rawScoreLogs)) saveScoreLogs();
  favorites = new Set(cleanArr(loadJSON(FAVORITES_KEY, []), 5000).filter(id => typeof id === "string"));
  settings = sanitizeSettings(loadJSON(SETTINGS_KEY, {}));
  requestPersistentStorage();
  mergeDrills();
  populateFilters();
  updateRestoreButton();
  render();

  catSelect.addEventListener("change", () => { state.category = catSelect.value; render(); });
  diffSelect.addEventListener("change", () => { state.difficulty = diffSelect.value; render(); });
  equipSelect.addEventListener("change", () => { state.equipment = equipSelect.value; render(); });
  const searchInput = document.getElementById("filter-search");
  const favFilterBtn = document.getElementById("filter-fav");
  searchInput.addEventListener("input", () => { state.search = searchInput.value; render(); });
  favFilterBtn.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;
    updateFavoriteFilterButton();
    render();
  });
  resetBtn.addEventListener("click", () => {
    state.category = ""; state.difficulty = ""; state.equipment = ""; state.search = ""; state.favoritesOnly = false;
    catSelect.value = ""; diffSelect.value = ""; equipSelect.value = ""; searchInput.value = "";
    updateFavoriteFilterButton();
    render();
  });
  initSettingsDialog();
  document.getElementById("update-reload-btn").addEventListener("click", () => location.reload());
  closeBtn.addEventListener("click", closeDetail);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDetail(); closeCreate(); closeSettings(); }
  });

  addDrillBtn.addEventListener("click", openCreate);
  createClose.addEventListener("click", closeCreate);
  createCancel.addEventListener("click", closeCreate);
  createOverlay.addEventListener("click", (e) => { if (e.target === createOverlay) closeCreate(); });
  createForm.addEventListener("submit", handleCreateSubmit);

  restoreBuiltinsBtn.addEventListener("click", restoreBuiltins);
  exportBtn.addEventListener("click", exportAll);
  importBtn.addEventListener("click", () => importFileInput.click());
  const importLinkBtn = document.getElementById("import-link-btn");
  if (importLinkBtn) importLinkBtn.addEventListener("click", importFromPastedLink);
  window.addEventListener("hashchange", handleSharedLinkFromUrl);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopParTimer(); });
  importFileInput.addEventListener("change", () => {
    if (importFileInput.files[0]) importFile(importFileInput.files[0]);
    importFileInput.value = "";
  });

  initBuilder();
  initEquipmentMultiselect();

  if (localStorage.getItem(STORAGE_WARNING_KEY) !== "1") storageWarning.classList.remove("hidden");
  storageWarningClose.addEventListener("click", () => {
    storageWarning.classList.add("hidden");
    localStorage.setItem(STORAGE_WARNING_KEY, "1");
  });

  handleSharedLinkFromUrl();
  initServiceWorker();
}

// ---------- Storage helpers ----------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    alert("Konnte nicht im Browser gespeichert werden (localStorage nicht verfügbar).");
  }
}

function saveCustomDrills() { saveJSON(CUSTOM_STORAGE_KEY, customDrills); }
function saveEditedBuiltins() { saveJSON(EDITED_BUILTINS_KEY, editedBuiltins); }
function saveDeletedBuiltins() { saveJSON(DELETED_BUILTINS_KEY, deletedBuiltinIds); }

// Bittet den Browser, die gespeicherten Daten nicht automatisch zu löschen.
// Wird still ignoriert, wenn der Browser das nicht unterstützt oder ablehnt.
function requestPersistentStorage() {
  if (!(navigator.storage && navigator.storage.persist)) return;
  navigator.storage.persisted()
    .then(already => already || navigator.storage.persist())
    .catch(() => {});
}

// ---------- Favoriten ----------

function saveFavorites() { saveJSON(FAVORITES_KEY, [...favorites]); }

function isFavorite(id) { return favorites.has(id); }

function toggleFavorite(id) {
  if (favorites.has(id)) favorites.delete(id); else favorites.add(id);
  saveFavorites();
  render();
}

function updateFavoriteFilterButton() {
  const btn = document.getElementById("filter-fav");
  if (!btn) return;
  btn.setAttribute("aria-pressed", state.favoritesOnly ? "true" : "false");
  btn.textContent = state.favoritesOnly ? "★ Nur Favoriten" : "☆ Nur Favoriten";
  btn.classList.toggle("active", state.favoritesOnly);
}

// ---------- Einstellungen ----------

function sanitizeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    powerFactor: src.powerFactor === "major" ? "major" : "minor",
    timerDelay: Object.prototype.hasOwnProperty.call(TIMER_DELAYS, src.timerDelay) ? src.timerDelay : DEFAULT_SETTINGS.timerDelay,
    timerReps: cleanInt(src.timerReps, DEFAULT_SETTINGS.timerReps, 1, 50)
  };
}

function initSettingsDialog() {
  const overlayEl = document.getElementById("settings-overlay");
  document.getElementById("settings-btn").addEventListener("click", openSettings);
  document.getElementById("settings-close").addEventListener("click", closeSettings);
  document.getElementById("settings-cancel").addEventListener("click", closeSettings);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeSettings(); });
  document.getElementById("settings-save").addEventListener("click", () => {
    settings = sanitizeSettings({
      powerFactor: document.getElementById("set-power").value,
      timerDelay: document.getElementById("set-delay").value,
      timerReps: document.getElementById("set-reps").value
    });
    saveJSON(SETTINGS_KEY, settings);
    closeSettings();
    showDbMsg("Einstellungen gespeichert.");
  });
}

function openSettings() {
  document.getElementById("set-power").value = settings.powerFactor;
  document.getElementById("set-delay").value = settings.timerDelay;
  document.getElementById("set-reps").value = settings.timerReps;
  document.getElementById("settings-version").textContent = `App-Version ${APP_VERSION}`;
  document.getElementById("settings-overlay").classList.remove("hidden");
  lockBodyScroll();
}

function closeSettings() {
  const overlayEl = document.getElementById("settings-overlay");
  if (!overlayEl || overlayEl.classList.contains("hidden")) return;
  overlayEl.classList.add("hidden");
  unlockBodyScroll();
}

// ---------- Update-Hinweis ----------
// Der Service Worker meldet seine Version. Weicht sie von der geladenen App ab
// (z.B. weil die App aus dem Cache kam oder lange offen war), erscheint ein Hinweis.

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  sw.addEventListener("message", (event) => {
    const data = event.data || {};
    if (data.type === "version" && data.version && data.version !== APP_VERSION) showUpdateBanner();
  });
  const askVersion = () => { if (sw.controller) sw.controller.postMessage("version"); };
  sw.addEventListener("controllerchange", askVersion);
  const register = () => {
    sw.register("sw.js").then((registration) => {
      askVersion();
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) registration.update().catch(() => {});
      });
    }).catch(() => { /* ohne Offline-Cache geht die App trotzdem */ });
  };
  if (document.readyState === "complete") register(); else window.addEventListener("load", register);
}

function showUpdateBanner() {
  const banner = document.getElementById("update-banner");
  if (banner) banner.classList.remove("hidden");
}

// ---------- Suche ----------

function normalizeSearch(text) {
  return String(text || "").toLowerCase().replace(/ß/g, "ss").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function drillSearchText(drill) {
  return normalizeSearch([drill.title, drill.category, drill.difficulty, drill.distance, drill.procedure, drill.focus,
    ...(drill.equipment || [])].join(" "));
}

function newCustomId() {
  return "custom-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
}

// ---------- Datenprüfung ----------
// Alles, was aus localStorage oder aus einer Import-Datei kommt, wird hier auf
// erlaubte Felder und Datentypen reduziert. Damit kann eine manipulierte
// JSON-Datei keinen Code in die Seite einschleusen (Zahlen landen z.B.
// ungeprüft in SVG-Attributen).

// (Erlaubte Typen stehen oben bei den Konstanten, weil init() sie schon beim Start braucht.)

function cleanStr(v, max = 5000) {
  if (typeof v === "string") return v.slice(0, max);
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

function cleanNum(v, fallback = 0, min = -10000, max = 10000) {
  const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function cleanInt(v, fallback = 0, min = 0, max = 100000) {
  const n = cleanNum(v, NaN, min, max);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

function cleanArr(v, max = 500) {
  return Array.isArray(v) ? v.slice(0, max) : [];
}

function cleanId(v) {
  return typeof v === "string" && v.length > 0 && v.length <= 200 ? v : null;
}

function isValidSketchDataUrl(v) {
  return typeof v === "string" && v.length < 5000000 && SKETCH_DATA_URL_RE.test(v);
}

function sanitizeLayout(raw) {
  if (!raw || typeof raw !== "object") return emptyBuilderLayout();
  const isObj = o => o && typeof o === "object";
  // Koordinaten werden auf ganze Zahlen gerundet – optisch kein Unterschied,
  // aber kürzere Teilen-Links und gleiche Trainings werden sicher als gleich erkannt.
  const coord = v => Math.round(cleanNum(v));
  const pos = o => ({ x: coord(o.x), y: coord(o.y) });
  const layout = {
    viewW: cleanNum(raw.viewW, 400, 50, 4000),
    viewH: cleanNum(raw.viewH, 500, 50, 4000),
    targets: cleanArr(raw.targets).filter(t => isObj(t) && TARGET_TYPES.includes(t.type)).map(t => ({
      ...pos(t), type: t.type, label: cleanStr(t.label, 40), ...(t.headZone ? { headZone: true } : {})
    })),
    shooterPositions: cleanArr(raw.shooterPositions).filter(isObj).map(sp => ({
      ...pos(sp), facing: cleanNum(sp.facing, 0, 0, 359), label: cleanStr(sp.label, 40)
    })),
    walls: cleanArr(raw.walls).filter(isObj).map(w => ({
      x1: coord(w.x1), y1: coord(w.y1), x2: coord(w.x2), y2: coord(w.y2)
    })),
    boxes: cleanArr(raw.boxes).filter(isObj).map(b => ({
      ...pos(b), w: Math.round(cleanNum(b.w, 40, 1, 4000)), h: Math.round(cleanNum(b.h, 40, 1, 4000)), label: cleanStr(b.label, 40)
    })),
    props: cleanArr(raw.props).filter(pr => isObj(pr) && PROP_TYPES.includes(pr.type)).map(pr => ({
      ...pos(pr), type: pr.type, label: cleanStr(pr.label, 40)
    })),
    path: cleanArr(raw.path).filter(Array.isArray).map(pt => [coord(pt[0]), coord(pt[1])])
  };
  if (isObj(raw.dotsGrid)) {
    const dg = raw.dotsGrid;
    layout.dotsGrid = {
      x: cleanNum(dg.x), y: cleanNum(dg.y),
      rows: cleanInt(dg.rows, 1, 1, 20), cols: cleanInt(dg.cols, 1, 1, 20),
      spacing: cleanNum(dg.spacing, 30, 1, 500), r: cleanNum(dg.r, 10, 1, 100)
    };
  }
  return layout;
}

// Liefert nur die inhaltlichen Felder eines Trainings (ohne id/custom) – oder
// null, wenn Titel oder Kategorie fehlen.
function sanitizeDrill(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = cleanStr(raw.title, 200).trim();
  const category = cleanStr(raw.category, 100).trim();
  if (!title || !category) return null;
  const drill = {
    title,
    category,
    difficulty: cleanStr(raw.difficulty, 100),
    equipment: cleanArr(raw.equipment, 50).filter(e => typeof e === "string").map(e => e.slice(0, 100)),
    rounds: cleanInt(raw.rounds, null, 0, 10000),
    distance: cleanStr(raw.distance, 100),
    parTime: cleanStr(raw.parTime, 100),
    procedure: cleanStr(raw.procedure),
    focus: cleanStr(raw.focus, 500),
    layout: sanitizeLayout(raw.layout)
  };
  if (raw.courseType) drill.courseType = cleanStr(raw.courseType, 100);
  if (isValidSketchDataUrl(raw.sketchDataUrl)) drill.sketchDataUrl = raw.sketchDataUrl;
  return drill;
}

// Inhaltlicher "Fingerabdruck" – gleiche Trainings werden beim Import erkannt.
function drillFingerprint(drill) {
  const clean = sanitizeDrill(drill);
  return clean ? JSON.stringify(clean) : "";
}

function sanitizeStoredCustomDrills(list) {
  return cleanArr(list, 5000).map(d => {
    const clean = sanitizeDrill(d);
    return clean ? { ...clean, id: cleanId(d.id) || newCustomId(), custom: true } : null;
  }).filter(Boolean);
}

function sanitizeStoredEditedBuiltins(map) {
  const result = {};
  if (!map || typeof map !== "object" || Array.isArray(map)) return result;
  for (const [id, d] of Object.entries(map)) {
    const clean = cleanId(id) && sanitizeDrill(d);
    if (clean) result[id] = { ...clean, id, custom: false, builtinEdited: true };
  }
  return result;
}

function sanitizeScoreEntry(e) {
  if (!e || typeof e !== "object") return null;
  const time = cleanNum(e.time, 0, 0, 100000);
  if (!(time > 0)) return null;
  const date = typeof e.date === "string" && !isNaN(Date.parse(e.date)) ? e.date : new Date(0).toISOString();
  const hits = k => cleanInt(e[k], 0, 0, 1000);
  const entry = {
    date,
    alpha: hits("alpha"), charlie: hits("charlie"), delta: hits("delta"),
    mike: hits("mike"), noshoot: hits("noshoot"), procedural: hits("procedural"),
    time, major: !!e.major
  };
  entry.points = calcIpscPoints(entry.alpha, entry.charlie, entry.delta, entry.mike, entry.noshoot, entry.procedural, entry.major);
  entry.hitFactor = calcHitFactor(entry.points, entry.time);
  return entry;
}

function sanitizeScoreLogs(logs) {
  const result = {};
  if (!logs || typeof logs !== "object" || Array.isArray(logs)) return result;
  for (const [drillId, entries] of Object.entries(logs)) {
    if (!cleanId(drillId)) continue;
    const clean = cleanArr(entries, 10000).map(sanitizeScoreEntry).filter(Boolean);
    if (clean.length) result[drillId] = clean;
  }
  return result;
}

function scoreEntryKey(e) {
  return [e.date, e.alpha, e.charlie, e.delta, e.mike, e.noshoot, e.procedural, e.time, e.major].join("|");
}

function mergeDrills() {
  const deletedSet = new Set(deletedBuiltinIds);
  const base = (window.IPSC_DRILLS || [])
    .filter(d => !deletedSet.has(d.id))
    .map(d => editedBuiltins[d.id] ? { ...editedBuiltins[d.id], id: d.id, custom: false, builtinEdited: true } : d);
  DRILLS = [...base, ...customDrills];
}

function showDbMsg(text) {
  dbToolsMsg.textContent = text;
  clearTimeout(showDbMsg._t);
  showDbMsg._t = setTimeout(() => { dbToolsMsg.textContent = ""; }, 6000);
}

function updateRestoreButton() {
  restoreBuiltinsBtn.classList.toggle("hidden", deletedBuiltinIds.length === 0);
  restoreBuiltinsBtn.textContent = `${deletedBuiltinIds.length} gelöschte Standard-Trainings wiederherstellen`;
}

function restoreBuiltins() {
  deletedBuiltinIds = [];
  saveDeletedBuiltins();
  mergeDrills();
  populateFilters();
  updateRestoreButton();
  render();
}

// ---------- Filters ----------

function populateFilters() {
  const prevCat = catSelect.value, prevDiff = diffSelect.value, prevEquip = equipSelect.value;
  catSelect.innerHTML = '<option value="">Alle</option>';
  diffSelect.innerHTML = '<option value="">Alle</option>';
  equipSelect.innerHTML = '<option value="">Alle</option>';

  fillSelect(catSelect, uniqueSorted(DRILLS.map(d => d.category)));
  fillSelect(diffSelect, uniqueSorted(DRILLS.map(d => d.difficulty).filter(Boolean)));
  fillSelect(equipSelect, uniqueSorted(DRILLS.flatMap(d => d.equipment || [])));

  if ([...catSelect.options].some(o => o.value === prevCat)) catSelect.value = prevCat;
  if ([...diffSelect.options].some(o => o.value === prevDiff)) diffSelect.value = prevDiff;
  if ([...equipSelect.options].some(o => o.value === prevEquip)) equipSelect.value = prevEquip;

  fillDatalist(document.getElementById("category-options"), uniqueSorted(DRILLS.map(d => d.category)));
  fillDatalist(document.getElementById("difficulty-options"), uniqueSorted(DRILLS.map(d => d.difficulty).filter(Boolean)));
}

function fillDatalist(datalist, values) {
  if (!datalist) return;
  datalist.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    datalist.appendChild(opt);
  }
}

function fillSelect(select, values) {
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
}

function uniqueSorted(arr) {
  return [...new Set(arr)].sort((a, b) => a.localeCompare(b, "de"));
}

function getFiltered() {
  const terms = normalizeSearch(state.search).split(/\s+/).filter(Boolean);
  const filtered = DRILLS.filter(d => {
    if (state.category && d.category !== state.category) return false;
    if (state.difficulty && d.difficulty !== state.difficulty) return false;
    if (state.equipment && !(d.equipment || []).includes(state.equipment)) return false;
    if (state.favoritesOnly && !isFavorite(d.id)) return false;
    if (terms.length) {
      const haystack = drillSearchText(d);
      if (!terms.every(t => haystack.includes(t))) return false;
    }
    return true;
  });
  // Favoriten zuerst, sonst Reihenfolge der Bibliothek beibehalten
  return filtered
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (isFavorite(b.d.id) - isFavorite(a.d.id)) || (a.i - b.i))
    .map(x => x.d);
}

// ---------- Rendering the grid / cards ----------

function render() {
  const filtered = getFiltered();
  resultCount.textContent = `${filtered.length} von ${DRILLS.length} Trainings`;
  grid.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.textContent = DRILLS.length === 0
      ? "Noch keine Trainings vorhanden. Klicke auf „+ Eigenes Training“, um dein erstes Training zu erstellen – oder importiere eine geteilte Datei von einem Kollegen."
      : state.favoritesOnly && favorites.size === 0
        ? "Noch keine Favoriten. Tippe bei einem Training auf den Stern, um es hier zu sammeln."
        : "Keine Trainings gefunden. Suche oder Filter anpassen bzw. zurücksetzen.";
    grid.appendChild(empty);
    return;
  }

  for (const drill of filtered) {
    grid.appendChild(buildCard(drill));
  }
}

function buildCard(drill) {
  const card = document.createElement("div");
  card.className = "drill-card";
  card.tabIndex = 0;
  const fav = isFavorite(drill.id);
  card.innerHTML = `
    <button type="button" class="fav-btn${fav ? " active" : ""}" aria-pressed="${fav}" aria-label="${fav ? "Favorit entfernen" : "Als Favorit markieren"}" title="Favorit">${fav ? "★" : "☆"}</button>
    <h3>${escapeHtml(drill.title)}</h3>
    <div class="drill-meta">
      <span class="badge">${escapeHtml(drill.category)}</span>
      ${drill.difficulty ? `<span class="badge difficulty">${escapeHtml(drill.difficulty)}</span>` : ""}
      ${drill.custom ? `<span class="badge custom">Eigenes</span>` : ""}
      ${drill.builtinEdited ? `<span class="badge builtin-edited">Bearbeitet</span>` : ""}
    </div>
    <div class="drill-stats">
      <span>${drill.rounds ? escapeHtml(String(drill.rounds)) + " Schuss" : ""}</span>
      <span>${escapeHtml(drill.distance || "")}</span>
    </div>
  `;
  card.querySelector(".fav-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(drill.id);
  });
  card.addEventListener("click", () => openDetail(drill));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === card) openDetail(drill); });
  return card;
}

function openDetail(drill, options = {}) {
  const preview = !!options.preview;
  const alreadyOpen = !overlay.classList.contains("hidden");
  stopParTimer();

  const sketchHtml = isValidSketchDataUrl(drill.sketchDataUrl)
    ? `<div class="sketch-img-wrap"><img src="${escapeHtml(drill.sketchDataUrl)}" alt="Stage-Skizze"></div>`
    : `<div class="layout-svg-wrap">${renderLayout(drill.layout || {})}</div>`;

  detailContent.innerHTML = `
    ${preview ? `<div class="preview-banner">Geteiltes Training – noch nicht in deiner Bibliothek gespeichert.</div>` : ""}
    <h2>${escapeHtml(drill.title)}</h2>
    <div class="drill-meta">
      <span class="badge">${escapeHtml(drill.category)}</span>
      ${drill.difficulty ? `<span class="badge difficulty">${escapeHtml(drill.difficulty)}</span>` : ""}
      ${(drill.equipment || []).map(e => `<span class="badge difficulty">${escapeHtml(e)}</span>`).join("")}
      ${drill.custom ? `<span class="badge custom">Eigenes</span>` : ""}
      ${drill.builtinEdited ? `<span class="badge builtin-edited">Bearbeitet</span>` : ""}
    </div>

    <div class="detail-grid">
      <div class="stat-box"><div class="label">Schusszahl</div><div class="value">${escapeHtml(String(drill.rounds || "–"))}</div></div>
      <div class="stat-box"><div class="label">Distanz</div><div class="value">${escapeHtml(drill.distance || "–")}</div></div>
      <div class="stat-box"><div class="label">Par-Zeit / Ziel</div><div class="value">${escapeHtml(drill.parTime || "–")}</div></div>
      <div class="stat-box"><div class="label">Fokus</div><div class="value">${escapeHtml(drill.focus || "–")}</div></div>
      ${drill.courseType ? `<div class="stat-box"><div class="label">Kursart (IPSC)</div><div class="value">${escapeHtml(drill.courseType)}</div></div>` : ""}
    </div>

    <div class="section-title">Stage-Skizze</div>
    ${sketchHtml}
    ${isValidSketchDataUrl(drill.sketchDataUrl) ? "" : `
    <div class="sketch-actions">
      <button type="button" class="tool-btn" id="sketch-image-btn">Skizze als Bild speichern</button>
      <span class="sketch-msg" id="sketch-msg"></span>
    </div>`}

    <div class="section-title">Ablauf</div>
    <div class="procedure-text">${escapeHtml(drill.procedure || "")}</div>

    <div class="section-title">Par-Timer</div>
    ${parTimerHtml(drill)}

    ${preview ? "" : `
    <div class="section-title">Eigene Ergebnisse &amp; Hit-Factor</div>
    <div id="score-section"></div>`}

    <div id="action-row" class="db-tools"></div>
    <div id="share-panel" class="share-panel hidden"></div>
  `;
  overlay.classList.remove("hidden");
  if (!alreadyOpen) lockBodyScroll();
  if (!alreadyOpen) overlay.scrollTop = 0;

  initParTimer();
  const sketchBtn = document.getElementById("sketch-image-btn");
  if (sketchBtn) sketchBtn.addEventListener("click", () => saveSketchImage(drill));

  if (preview) {
    renderPreviewActions(drill);
  } else {
    refreshScoreSection(drill);
    renderDetailActions(drill);
  }
}

function renderDetailActions(drill) {
  const row = document.getElementById("action-row");
  const fav = isFavorite(drill.id);
  row.innerHTML = `
    <button type="button" class="tool-btn fav-toggle${fav ? " active" : ""}" id="fav-drill-btn" aria-pressed="${fav}">${fav ? "★ Favorit" : "☆ Favorit"}</button>
    <button type="button" class="edit-btn" id="edit-drill-btn">Bearbeiten</button>
    <button type="button" class="tool-btn" id="share-drill-btn">Teilen</button>
    <button type="button" class="delete-btn" id="delete-drill-btn">Löschen</button>
  `;
  document.getElementById("fav-drill-btn").addEventListener("click", () => {
    toggleFavorite(drill.id);
    renderDetailActions(drill);
  });
  document.getElementById("edit-drill-btn").addEventListener("click", () => { closeDetail(); openEdit(drill); });
  document.getElementById("share-drill-btn").addEventListener("click", () => toggleSharePanel(drill));
  document.getElementById("delete-drill-btn").addEventListener("click", () => {
    const logCount = drill.custom ? getScoreLog(drill.id).length : 0;
    row.innerHTML = `
      <span class="confirm-text">"${escapeHtml(drill.title)}" wirklich löschen?${logCount ? ` Die ${logCount} eingetragenen Ergebnisse werden ebenfalls gelöscht.` : ""}</span>
      <button type="button" class="delete-btn confirm-yes" id="confirm-delete-yes">Ja, löschen</button>
      <button type="button" class="tool-btn" id="confirm-delete-no">Abbrechen</button>
    `;
    document.getElementById("confirm-delete-yes").addEventListener("click", () => { deleteDrill(drill); closeDetail(); });
    document.getElementById("confirm-delete-no").addEventListener("click", () => renderDetailActions(drill));
  });
}

function renderPreviewActions(drill) {
  const row = document.getElementById("action-row");
  row.innerHTML = `
    <button type="button" class="save-btn" id="preview-add-btn">Zu meinen Trainings hinzufügen</button>
    <button type="button" class="tool-btn" id="preview-discard-btn">Verwerfen</button>
  `;
  document.getElementById("preview-add-btn").addEventListener("click", () => addSharedDrill(drill));
  document.getElementById("preview-discard-btn").addEventListener("click", closeDetail);
}

function closeDetail() {
  stopParTimer();
  clearSharedLinkFromUrl();
  const wasOpen = !overlay.classList.contains("hidden");
  overlay.classList.add("hidden");
  if (wasOpen) unlockBodyScroll();
}

// iOS Safari rubber-bands the page behind a fixed overlay when the overlay's
// own content is scrolled past its edges, which briefly reveals the drill
// grid behind the modal. Locking body scroll while a modal is open stops it.
let bodyScrollLockCount = 0;
let bodyScrollY = 0;
function lockBodyScroll() {
  if (bodyScrollLockCount === 0) {
    bodyScrollY = window.scrollY;
    document.body.style.top = `-${bodyScrollY}px`;
    document.body.classList.add("modal-open");
  }
  bodyScrollLockCount++;
}
function unlockBodyScroll() {
  bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
  if (bodyScrollLockCount === 0) {
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, bodyScrollY);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Score log / Hit-Factor tracking (personal, not shared on export) ----------

function saveScoreLogs() { saveJSON(SCORE_LOG_KEY, scoreLogs); }

function getScoreLog(drillId) { return scoreLogs[drillId] || []; }

// IPSC-Wertung: A=5, C=4/3, D=2/1 (Major/Minor).
// Miss, No-Shoot und Procedural kosten je 10 Punkte.
// Das Ergebnis kann nicht negativ werden (IPSC-Regel: minimal 0 Punkte).
function calcIpscPoints(alpha, charlie, delta, mike, noshoot, procedural, major) {
  const raw = major
    ? alpha * 5 + charlie * 4 + delta * 2
    : alpha * 5 + charlie * 3 + delta * 1;
  const penalties = (mike + noshoot + procedural) * 10;
  return Math.max(0, raw - penalties);
}

function calcHitFactor(points, time) {
  return time > 0 ? Math.round((points / time) * 10000) / 10000 : 0;
}


function drillHasNoShoot(drill) {
  return !!(drill.layout && drill.layout.targets && drill.layout.targets.some(t => t.type === "noshoot"));
}

function addScoreEntry(drillId, alpha, charlie, delta, mike, noshoot, procedural, time, major) {
  const points = calcIpscPoints(alpha, charlie, delta, mike, noshoot, procedural, major);
  const hitFactor = calcHitFactor(points, time);
  const entry = { date: new Date().toISOString(), alpha, charlie, delta, mike, noshoot, procedural, time, major, points, hitFactor };
  if (!scoreLogs[drillId]) scoreLogs[drillId] = [];
  scoreLogs[drillId].push(entry);
  saveScoreLogs();
}

function deleteScoreEntry(drillId, index) {
  if (!scoreLogs[drillId]) return;
  scoreLogs[drillId].splice(index, 1);
  saveScoreLogs();
}

function formatScoreDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE") + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function scoreStats(log, parSeconds) {
  const hf = log.map(e => e.hitFactor);
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const aRate = entries => {
    const shots = entries.reduce((sum, e) => sum + e.alpha + e.charlie + e.delta + (e.mike || 0), 0);
    return shots ? entries.reduce((sum, e) => sum + e.alpha, 0) / shots : null;
  };
  const best = hf.length ? Math.max(...hf) : null;
  return {
    count: log.length,
    best,
    bestIndex: best === null ? -1 : hf.lastIndexOf(best),
    avgLast5: avg(hf.slice(-5)),
    avgPrev5: log.length >= 10 ? avg(hf.slice(-10, -5)) : null,
    aRate: aRate(log),
    aRateLast5: aRate(log.slice(-5)),
    parHits: parSeconds ? log.filter(e => e.time <= parSeconds).length : null
  };
}

function formatPercent(v) {
  return v === null ? "–" : `${Math.round(v * 100)} %`;
}

function scoreChartSvg(log) {
  const w = 340, h = 150, left = 34, right = 10, top = 12, bottom = 22;
  const values = log.map(e => e.hitFactor);
  const rolling = values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - 4), i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
  const min = Math.min(...values, ...rolling), max = Math.max(...values, ...rolling);
  const range = (max - min) || 1;
  const x = i => left + (values.length > 1 ? i * (w - left - right) / (values.length - 1) : 0);
  const y = v => top + (1 - (v - min) / range) * (h - top - bottom);
  const line = arr => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const bestIdx = values.lastIndexOf(Math.max(...values));
  const shortDate = iso => { const d = new Date(iso); return `${d.getDate()}.${d.getMonth() + 1}.`; };
  const dots = values.map((v, i) =>
    `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === bestIdx ? 5 : 3}" fill="${i === bestIdx ? "#7fbf7f" : "#e8620c"}"/>`).join("");
  return `
  <svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Verlauf des Hit-Factors">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#0b0d10" rx="6"/>
    <line x1="${left}" y1="${top}" x2="${w - right}" y2="${top}" stroke="#1f232a"/>
    <line x1="${left}" y1="${h - bottom}" x2="${w - right}" y2="${h - bottom}" stroke="#1f232a"/>
    <text x="${left - 4}" y="${top + 4}" fill="#9aa3af" font-size="10" text-anchor="end">${max.toFixed(2)}</text>
    <text x="${left - 4}" y="${h - bottom + 4}" fill="#9aa3af" font-size="10" text-anchor="end">${min.toFixed(2)}</text>
    <text x="${left}" y="${h - 6}" fill="#9aa3af" font-size="10">${escapeXml(shortDate(log[0].date))}</text>
    <text x="${w - right}" y="${h - 6}" fill="#9aa3af" font-size="10" text-anchor="end">${escapeXml(shortDate(log[log.length - 1].date))}</text>
    ${values.length >= 3 ? `<polyline points="${line(rolling)}" fill="none" stroke="#7fb0e8" stroke-width="2" stroke-dasharray="5,4"/>` : ""}
    <polyline points="${line(values)}" fill="none" stroke="#e8620c" stroke-width="2"/>
    ${dots}
  </svg>
  <div class="chart-legend"><span class="legend-hf">Hit-Factor</span>${values.length >= 3 ? `<span class="legend-avg">Ø der letzten 5</span>` : ""}<span class="legend-best">Bestwert</span></div>`;
}

function refreshScoreSection(drill, notice = "") {
  const container = document.getElementById("score-section");
  if (!container) return;
  const log = getScoreLog(drill.id);
  const hasNoShoot = drillHasNoShoot(drill);
  const par = parseParSeconds(drill.parTime);
  const stats = scoreStats(log, par);

  let trendHtml = "";
  if (stats.avgPrev5 !== null) {
    const diff = stats.avgLast5 - stats.avgPrev5;
    const cls = diff > 0 ? "score-trend-up" : diff < 0 ? "score-trend-down" : "score-trend-flat";
    trendHtml = `<span class="stat-trend ${cls}">${diff > 0 ? "▲" : diff < 0 ? "▼" : "–"} ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} zu den 5 davor</span>`;
  }
  const statsHtml = log.length ? `
    <div class="score-stats">
      <div class="stat-box"><div class="label">Versuche</div><div class="value">${stats.count}</div></div>
      <div class="stat-box"><div class="label">Bester Hit-Factor</div><div class="value">${stats.best.toFixed(2)}</div></div>
      <div class="stat-box"><div class="label">Ø letzte 5</div><div class="value">${stats.avgLast5.toFixed(2)}</div>${trendHtml}</div>
      <div class="stat-box"><div class="label">A-Quote gesamt / letzte 5</div><div class="value">${formatPercent(stats.aRate)} / ${formatPercent(stats.aRateLast5)}</div></div>
      ${par ? `<div class="stat-box"><div class="label">Innerhalb Par (${escapeHtml(String(par))} s)</div><div class="value">${stats.parHits} von ${stats.count}</div></div>` : ""}
    </div>` : "";

  const sparkline = log.length >= 2
    ? `<div class="score-chart-wrap">${scoreChartSvg(log)}</div>`
    : "";

  const rows = log.slice().reverse().map((entry, revIdx) => {
    const idx = log.length - 1 - revIdx;
    const prev = idx > 0 ? log[idx - 1] : null;
    let trendClass = "score-trend-flat", trendSymbol = "–";
    if (prev) {
      if (entry.hitFactor > prev.hitFactor) { trendClass = "score-trend-up"; trendSymbol = "▲"; }
      else if (entry.hitFactor < prev.hitFactor) { trendClass = "score-trend-down"; trendSymbol = "▼"; }
    }
    return `
      <tr>
        <td>${escapeHtml(formatScoreDate(entry.date))}</td>
        <td>${entry.alpha}</td>
        <td>${entry.charlie}</td>
        <td>${entry.delta}</td>
        <td>${entry.mike || 0}</td>
        ${hasNoShoot ? `<td>${entry.noshoot || 0}</td>` : ""}
        <td>${entry.procedural || 0}</td>
        <td>${entry.points}</td>
        <td>${entry.time.toFixed(2)} s</td>
        <td><strong>${entry.hitFactor.toFixed(4)}</strong></td>
        <td class="${trendClass}">${trendSymbol}</td>
        <td><button type="button" class="score-del-btn" data-idx="${idx}" title="Eintrag löschen">×</button></td>
      </tr>`;
  }).join("");

  const table = log.length > 0 ? `
    <div class="score-table-wrap">
    <table class="score-table">
      <thead><tr><th>Datum</th><th>A</th><th>C</th><th>D</th><th>M</th>${hasNoShoot ? "<th>NS</th>" : ""}<th>PE</th><th>Punkte</th><th>Zeit</th><th>Hit-Factor</th><th>Trend</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>` : `<p class="score-empty">Noch keine Versuche eingetragen.</p>`;

  container.innerHTML = `
    ${statsHtml}
    ${sparkline}
    ${table}
    <div class="score-form">
      <label class="score-field"><span>Alpha</span><input type="number" id="score-alpha" step="1" min="0" value="0"></label>
      <label class="score-field"><span>Charlie</span><input type="number" id="score-charlie" step="1" min="0" value="0"></label>
      <label class="score-field"><span>Delta</span><input type="number" id="score-delta" step="1" min="0" value="0"></label>
      <label class="score-field"><span>Mike</span><input type="number" id="score-mike" step="1" min="0" value="0"></label>
      ${hasNoShoot ? `<label class="score-field"><span>No-Shoot</span><input type="number" id="score-noshoot" step="1" min="0" value="0"></label>` : ""}
      <label class="score-field"><span>Procedural</span><input type="number" id="score-procedural" step="1" min="0" value="0"></label>
      <label class="score-field"><span>Zeit (Sekunden)</span><input type="number" id="score-time" step="0.01" min="0.01"></label>
      <label class="score-field">
        <span>Power Factor</span>
        <select id="score-major">
          <option value="0"${settings.powerFactor === "major" ? "" : " selected"}>Minor</option>
          <option value="1"${settings.powerFactor === "major" ? " selected" : ""}>Major</option>
        </select>
      </label>
      <button type="button" class="tool-btn" id="score-add-btn">Eintragen</button>
      <span class="score-result" id="score-live-result">${notice}</span>
    </div>
  `;

  const alphaInput = document.getElementById("score-alpha");
  const charlieInput = document.getElementById("score-charlie");
  const deltaInput = document.getElementById("score-delta");
  const mikeInput = document.getElementById("score-mike");
  const noshootInput = hasNoShoot ? document.getElementById("score-noshoot") : null;
  const proceduralInput = document.getElementById("score-procedural");
  const timeInput = document.getElementById("score-time");
  const majorSelect = document.getElementById("score-major");
  const liveResult = document.getElementById("score-live-result");

  const updateLive = () => {
    const a = parseInt(alphaInput.value, 10) || 0;
    const c = parseInt(charlieInput.value, 10) || 0;
    const d = parseInt(deltaInput.value, 10) || 0;
    const m = parseInt(mikeInput.value, 10) || 0;
    const ns = noshootInput ? (parseInt(noshootInput.value, 10) || 0) : 0;
    const pe = parseInt(proceduralInput.value, 10) || 0;
    const t = parseFloat(timeInput.value);
    const pts = calcIpscPoints(a, c, d, m, ns, pe, majorSelect.value === "1");
    if (t > 0) {
      liveResult.innerHTML = `${pts} Punkte – Hit-Factor: <strong>${(pts / t).toFixed(4)}</strong>`;
    } else {
      liveResult.textContent = pts !== 0 ? `${pts} Punkte – Zeit fehlt` : "";
    }
  };
  [alphaInput, charlieInput, deltaInput, mikeInput, proceduralInput, timeInput].forEach(el => el.addEventListener("input", updateLive));
  if (noshootInput) noshootInput.addEventListener("input", updateLive);
  majorSelect.addEventListener("change", updateLive);

  document.getElementById("score-add-btn").addEventListener("click", () => {
    const a = parseInt(alphaInput.value, 10) || 0;
    const c = parseInt(charlieInput.value, 10) || 0;
    const d = parseInt(deltaInput.value, 10) || 0;
    const m = parseInt(mikeInput.value, 10) || 0;
    const ns = noshootInput ? (parseInt(noshootInput.value, 10) || 0) : 0;
    const pe = parseInt(proceduralInput.value, 10) || 0;
    const t = parseFloat(timeInput.value);
    if (!(a + c + d + m + ns > 0) || !(t > 0)) { alert("Bitte mindestens einen Treffer/Fehlschuss (A/C/D/M/NS) und eine Zeit (> 0 Sekunden) angeben."); return; }
    const previousBest = log.length ? Math.max(...log.map(e => e.hitFactor)) : null;
    addScoreEntry(drill.id, a, c, d, m, ns, pe, t, majorSelect.value === "1");
    const newLog = getScoreLog(drill.id);
    const added = newLog[newLog.length - 1];
    const notice = previousBest !== null && added.hitFactor > previousBest
      ? `<strong>Neuer Bestwert!</strong> Hit-Factor ${added.hitFactor.toFixed(4)}`
      : `Eingetragen: Hit-Factor <strong>${added.hitFactor.toFixed(4)}</strong>`;
    refreshScoreSection(drill, notice);
  });

  container.querySelectorAll(".score-del-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteScoreEntry(drill.id, parseInt(btn.dataset.idx, 10));
      refreshScoreSection(drill);
    });
  });
}

// ---------- Par-Timer ----------
// Startsignal nach zufälliger Verzögerung und Signal bei Ablauf der Par-Zeit.
// Die Töne werden über die Web-Audio-Uhr geplant, damit sie auch bei
// ausgelastetem Handy zeitgenau kommen.


function parseParSeconds(text) {
  const m = String(text || "").replace(",", ".").match(/\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parTimerHtml(drill) {
  const par = parseParSeconds(drill.parTime);
  return `
    <div class="timer" id="par-timer">
      <div class="timer-display" id="timer-display" aria-live="polite">Bereit</div>
      <div class="timer-sub" id="timer-sub">Auf Start tippen</div>
      <div class="timer-settings">
        <label class="score-field"><span>Par-Zeit (Sekunden)</span><input type="number" id="timer-par" step="0.1" min="0" max="600" inputmode="decimal" value="${par !== null ? escapeHtml(String(par)) : ""}" placeholder="ohne"></label>
        <label class="score-field"><span>Startverzögerung</span>
          <select id="timer-delay">
            ${Object.entries(TIMER_DELAYS).map(([value, label]) =>
              `<option value="${value}"${value === settings.timerDelay ? " selected" : ""}>${label}</option>`).join("")}
          </select>
        </label>
        <label class="score-field"><span>Durchgänge</span><input type="number" id="timer-reps" step="1" min="1" max="50" inputmode="numeric" value="${settings.timerReps}"></label>
      </div>
      <div class="timer-actions">
        <button type="button" class="save-btn timer-start" id="timer-start">Start</button>
        <button type="button" class="tool-btn" id="timer-stop" disabled>Stopp</button>
      </div>
      <button type="button" class="tool-btn timer-to-score hidden" id="timer-to-score">Ergebnis eintragen ↓</button>
      <p class="timer-hint">Lautstärke hoch und am iPhone den Stummschalter ausschalten. Beim Trockentraining keine Munition im Raum.</p>
    </div>`;
}

function initParTimer() {
  const startBtn = document.getElementById("timer-start");
  const stopBtn = document.getElementById("timer-stop");
  if (!startBtn) return;
  startBtn.addEventListener("click", startParTimer);
  document.getElementById("timer-to-score").addEventListener("click", jumpToScoreForm);
  stopBtn.addEventListener("click", () => {
    stopParTimer();
    setTimerText("Gestoppt", "Auf Start tippen", "");
  });
}

function setTimerToScoreVisible(visible) {
  const btn = document.getElementById("timer-to-score");
  // Nur anbieten, wenn es einen Ergebnis-Bereich gibt (nicht in der Vorschau geteilter Trainings)
  if (btn) btn.classList.toggle("hidden", !visible || !document.getElementById("score-section"));
}

function jumpToScoreForm() {
  const alpha = document.getElementById("score-alpha");
  if (!alpha) return;
  alpha.scrollIntoView({ behavior: "smooth", block: "center" });
  alpha.focus({ preventScroll: true });
  if (alpha.select) alpha.select();
}

function getAudioContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    if (!parTimer.ctx) parTimer.ctx = new AC();
    if (parTimer.ctx.state === "suspended") parTimer.ctx.resume();
    return parTimer.ctx;
  } catch (e) {
    return null;
  }
}

function scheduleBeep(ctx, at, duration, frequency) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(0.8, at + 0.005);
  gain.gain.setValueAtTime(0.8, at + duration - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
  parTimer.nodes.push(osc);
}

function timerLater(ms, fn) {
  parTimer.timeouts.push(setTimeout(fn, ms));
}

function vibrate(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch (e) { /* ignorieren */ } }
}

function setTimerText(main, sub, state) {
  const display = document.getElementById("timer-display");
  const subEl = document.getElementById("timer-sub");
  const box = document.getElementById("par-timer");
  if (display) display.textContent = main;
  if (subEl) subEl.textContent = sub;
  if (box) box.dataset.state = state || "";
}

function setTimerRunning(running) {
  parTimer.running = running;
  const startBtn = document.getElementById("timer-start");
  const stopBtn = document.getElementById("timer-stop");
  if (startBtn) startBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;
  ["timer-par", "timer-delay", "timer-reps"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = running;
  });
}

async function requestWakeLock() {
  try {
    if (navigator.wakeLock) parTimer.wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) { /* nicht unterstützt oder abgelehnt */ }
}

function startParTimer() {
  stopParTimer();
  const par = cleanNum(document.getElementById("timer-par").value, 0, 0, 600);
  const reps = cleanInt(document.getElementById("timer-reps").value, 1, 1, 50);
  const [delayMin, delayMax] = document.getElementById("timer-delay").value.split("-").map(Number);
  const ctx = getAudioContext();
  const token = ++parTimer.token;
  setTimerToScoreVisible(false);
  setTimerRunning(true);
  requestWakeLock();

  const runRep = (rep) => {
    if (token !== parTimer.token) return;
    const delay = delayMin + Math.random() * (delayMax - delayMin);
    const repText = reps > 1 ? `Durchgang ${rep} von ${reps}` : "Warte auf das Signal";
    setTimerText("Achtung …", repText, "armed");

    if (ctx) {
      const t0 = ctx.currentTime + delay;
      scheduleBeep(ctx, t0, 0.35, 2600);
      if (par > 0) {
        scheduleBeep(ctx, t0 + par, 0.15, 2600);
        scheduleBeep(ctx, t0 + par + 0.22, 0.15, 2600);
      }
    }

    const startAt = performance.now() + delay * 1000;
    timerLater(delay * 1000, () => {
      if (token !== parTimer.token) return;
      vibrate(200);
      const tick = () => {
        if (token !== parTimer.token) return;
        const elapsed = Math.max(0, (performance.now() - startAt) / 1000);
        setTimerText(`${elapsed.toFixed(2)} s`, par > 0 ? `Par ${par.toFixed(2)} s` : repText, "running");
        parTimer.rafId = requestAnimationFrame(tick);
      };
      tick();
    });

    const endMs = (delay + par) * 1000;
    timerLater(endMs, () => {
      if (token !== parTimer.token) return;
      cancelAnimationFrame(parTimer.rafId);
      if (par > 0) vibrate([100, 80, 100]);
      const main = par > 0 ? `${par.toFixed(2)} s` : "Los!";
      if (rep < reps) {
        setTimerText(main, `Nächster Durchgang gleich – zurück in die Startposition`, "done");
        timerLater(par > 0 ? PAR_RESET_MS : NO_PAR_RESET_MS, () => runRep(rep + 1));
      } else {
        setTimerText(main, par > 0 ? "Par-Zeit abgelaufen – fertig" : "Startsignal gegeben – fertig", "done");
        finishParTimer(token);
      }
    });
  };

  runRep(1);
}

function finishParTimer(token) {
  if (token !== parTimer.token) return;
  // Laufende Töne (Par-Doppelton) ausklingen lassen, dann aufräumen
  timerLater(600, () => {
    if (token !== parTimer.token) return;
    setTimerRunning(false);
    setTimerToScoreVisible(true);
    releaseWakeLock();
  });
}

function releaseWakeLock() {
  if (parTimer.wakeLock) {
    parTimer.wakeLock.release().catch(() => {});
    parTimer.wakeLock = null;
  }
}

function stopParTimer() {
  parTimer.token++;
  parTimer.timeouts.forEach(clearTimeout);
  parTimer.timeouts = [];
  cancelAnimationFrame(parTimer.rafId);
  parTimer.nodes.forEach(osc => { try { osc.stop(); } catch (e) { /* schon beendet */ } });
  parTimer.nodes = [];
  releaseWakeLock();
  if (parTimer.running) setTimerRunning(false);
}

// ---------- Skizze als Bild ----------

function buildSketchImageSvg(drill) {
  const layout = drill.layout || {};
  const w = layout.viewW || 400, h = layout.viewH || 500;
  const header = 92, scale = 2;
  const clip = (text, max) => text.length > max ? text.slice(0, max - 1) + "…" : text;
  const info = [drill.distance, drill.rounds ? `${drill.rounds} Schuss` : "", drill.parTime ? `Par ${drill.parTime}` : ""]
    .filter(Boolean).join(", ");
  const font = "Segoe UI, Helvetica, Arial, sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${(h + header) * scale}" viewBox="0 0 ${w} ${h + header}">
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 z" fill="#8a92a0"/>
    </marker>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h + header}" fill="#0b0d10"/>
  <text x="16" y="34" fill="#e9ebee" font-size="20" font-weight="700" font-family="${font}">${escapeXml(clip(drill.title || "", 34))}</text>
  <text x="16" y="58" fill="#e8620c" font-size="13" font-family="${font}">${escapeXml(clip([drill.category, drill.difficulty].filter(Boolean).join(" – "), 50))}</text>
  <text x="16" y="79" fill="#9aa3af" font-size="13" font-family="${font}">${escapeXml(clip(info, 55))}</text>
  <g transform="translate(0, ${header})">${renderLayoutInner(layout)}</g>
  <text x="${w - 10}" y="${h + header - 10}" fill="#5a6270" font-size="10" text-anchor="end" font-family="${font}">IPSC Trainings-Bibliothek</text>
</svg>`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveSketchImage(drill) {
  const msg = document.getElementById("sketch-msg");
  const say = text => { if (msg) msg.textContent = text; };
  const svg = buildSketchImageSvg(drill);
  const baseName = "skizze-" + slugify(drill.title);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Kein Bild erzeugt");
    const file = new File([blob], baseName + ".png", { type: "image/png" });
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: drill.title });
        say("Bild geteilt.");
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    downloadBlob(blob, file.name);
    say("Bild heruntergeladen.");
  } catch (e) {
    // Falls der Browser das Umwandeln in PNG nicht kann: Vektorgrafik speichern
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), baseName + ".svg");
    say("Als SVG-Grafik gespeichert (PNG wird von diesem Browser nicht unterstützt).");
  }
}

// ---------- Teilen per Link / QR-Code ----------
// Das Training steckt komprimiert im Link (#t=...). Es gibt keinen Server:
// Wer den Link öffnet, sieht das Training und kann es selbst speichern.


function bytesToBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function transformBytes(bytes, stream, maxBytes) {
  const writer = stream.writable.getWriter();
  const writing = writer.write(bytes).then(() => writer.close());
  writing.catch(() => {}); // Fehler kommen über den Lesezweig an, nicht doppelt melden
  const reader = stream.readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new Error("zu groß");
      chunks.push(value);
    }
  } catch (e) {
    reader.cancel().catch(() => {});
    throw e;
  }
  await writing;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return out;
}

// Leere Felder weglassen, damit der Link möglichst kurz wird
function compactForLink(drill) {
  const clean = sanitizeDrill(drill);
  const out = {};
  for (const [key, value] of Object.entries(clean)) {
    if (value === "" || value === null || (Array.isArray(value) && value.length === 0)) continue;
    if (key === "layout") {
      const layout = {};
      for (const [lk, lv] of Object.entries(value)) {
        if (Array.isArray(lv) && lv.length === 0) continue;
        if ((lk === "viewW" && lv === 400) || (lk === "viewH" && lv === 500)) continue;
        layout[lk] = lv;
      }
      out.layout = layout;
    } else {
      out[key] = value;
    }
  }
  delete out.sketchDataUrl; // Bilder wären für einen Link viel zu groß
  return out;
}

async function buildShareLink(drill) {
  const bytes = new TextEncoder().encode(JSON.stringify(compactForLink(drill)));
  let prefix = "p", payload = bytes;
  if (typeof CompressionStream === "function") {
    try {
      payload = await transformBytes(bytes, new CompressionStream("deflate-raw"), MAX_SHARED_BYTES);
      prefix = "z";
    } catch (e) { /* ohne Kompression weiter */ }
  }
  return location.origin + location.pathname + SHARE_HASH_PREFIX + prefix + bytesToBase64Url(payload);
}

async function decodeSharedHash(hash) {
  const m = /#t=([zp])([A-Za-z0-9_-]+)$/.exec(hash || "");
  if (!m) return null;
  let bytes = base64UrlToBytes(m[2]);
  if (bytes.length > MAX_SHARED_BYTES) throw new Error("Link zu lang");
  if (m[1] === "z") {
    if (typeof DecompressionStream !== "function") throw new Error("Browser zu alt");
    bytes = await transformBytes(bytes, new DecompressionStream("deflate-raw"), MAX_SHARED_BYTES * 5);
  }
  return sanitizeDrill(JSON.parse(new TextDecoder().decode(bytes)));
}

function clearSharedLinkFromUrl() {
  if (location.hash.startsWith(SHARE_HASH_PREFIX) && history.replaceState) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

async function handleSharedLinkFromUrl() {
  if (!location.hash.startsWith(SHARE_HASH_PREFIX)) return;
  await openSharedDrill(location.hash);
}

async function openSharedDrill(hash) {
  let drill;
  try {
    drill = await decodeSharedHash(hash);
  } catch (e) {
    drill = null;
  }
  if (!drill) {
    clearSharedLinkFromUrl();
    alert("Der Trainings-Link ist unvollständig oder beschädigt. Lass ihn dir bitte noch einmal schicken.");
    return;
  }
  const fp = JSON.stringify(drill);
  const existing = DRILLS.find(d => drillFingerprint(d) === fp);
  if (existing) {
    clearSharedLinkFromUrl();
    showDbMsg(`"${drill.title}" ist bereits in deiner Bibliothek.`);
    openDetail(existing);
    return;
  }
  openDetail(drill, { preview: true });
}

function importFromPastedLink() {
  const text = prompt("Geteilten Trainings-Link hier einfügen:");
  if (!text) return;
  const idx = text.indexOf(SHARE_HASH_PREFIX);
  if (idx < 0) {
    alert("Das ist kein Trainings-Link. Er muss „#t=“ enthalten.");
    return;
  }
  openSharedDrill(text.slice(idx).trim());
}

function addSharedDrill(drill) {
  const clean = sanitizeDrill(drill);
  if (!clean) return;
  const fp = JSON.stringify(clean);
  let saved = customDrills.find(d => drillFingerprint(d) === fp);
  if (!saved) {
    saved = { ...clean, id: newCustomId(), custom: true };
    customDrills.push(saved);
    saveCustomDrills();
  }
  mergeDrills();
  populateFilters();
  updateRestoreButton();
  render();
  closeDetail();
  showDbMsg(`"${clean.title}" wurde zu deinen Trainings hinzugefügt.`);
  openDetail(DRILLS.find(d => d.id === saved.id));
}

function toggleSharePanel(drill) {
  const panel = document.getElementById("share-panel");
  if (!panel.classList.contains("hidden")) {
    panel.classList.add("hidden");
    return;
  }
  panel.innerHTML = `
    <div class="share-options">
      <button type="button" class="tool-btn" id="share-link-btn">Link teilen</button>
      <button type="button" class="tool-btn" id="share-qr-btn">QR-Code zeigen</button>
      <button type="button" class="tool-btn" id="share-file-btn">Als Datei</button>
    </div>
    <div id="share-output" class="share-output"></div>
  `;
  panel.classList.remove("hidden");
  const output = document.getElementById("share-output");

  const showLinkField = (link, note) => {
    output.innerHTML = `
      <p class="share-note">${escapeHtml(note)}</p>
      <input type="text" class="share-link-field" readonly value="${escapeHtml(link)}" aria-label="Trainings-Link">
    `;
    const field = output.querySelector(".share-link-field");
    field.addEventListener("focus", () => field.select());
  };

  document.getElementById("share-link-btn").addEventListener("click", async () => {
    const link = await buildShareLink(drill);
    if (navigator.share) {
      try {
        await navigator.share({ title: drill.title, text: `IPSC-Training: ${drill.title}`, url: link });
        showLinkField(link, "Link geteilt. Du kannst ihn hier auch kopieren:");
        return;
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    let copied = false;
    try {
      if (navigator.clipboard) { await navigator.clipboard.writeText(link); copied = true; }
    } catch (e) { /* Kopieren nicht erlaubt */ }
    showLinkField(link, copied ? "Link in die Zwischenablage kopiert:" : "Link zum Kopieren:");
  });

  document.getElementById("share-qr-btn").addEventListener("click", async () => {
    const link = await buildShareLink(drill);
    if (typeof qrcode !== "function") {
      showLinkField(link, "QR-Code ist gerade nicht verfügbar. Hier ist der Link:");
      return;
    }
    try {
      const qr = qrcode(0, "L");
      qr.addData(link);
      qr.make();
      output.innerHTML = `
        <div class="qr-wrap">${qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })}</div>
        <p class="share-note">Mit der Handykamera scannen, um das Training zu öffnen.</p>
      `;
    } catch (e) {
      showLinkField(link, "Das Training ist zu umfangreich für einen QR-Code. Teile stattdessen den Link:");
    }
  });

  document.getElementById("share-file-btn").addEventListener("click", () => shareDrill(drill));
}

// ---------- Create / edit / delete drills ----------

function deleteDrill(drill) {
  if (drill.custom) {
    customDrills = customDrills.filter(d => d.id !== drill.id);
    saveCustomDrills();
    if (favorites.delete(drill.id)) saveFavorites();
    // Ergebnisse gehören zum Training – sonst bleiben sie verwaist im Speicher.
    // (Bei Standard-Trainings bleiben sie erhalten, weil man diese wiederherstellen kann.)
    if (scoreLogs[drill.id]) {
      delete scoreLogs[drill.id];
      saveScoreLogs();
    }
  } else {
    if (!deletedBuiltinIds.includes(drill.id)) deletedBuiltinIds.push(drill.id);
    delete editedBuiltins[drill.id];
    saveDeletedBuiltins();
    saveEditedBuiltins();
  }
  mergeDrills();
  populateFilters();
  updateRestoreButton();
  render();
}

function openCreate() {
  editingDrillId = null;
  editingIsCustom = false;
  createTitleEl.textContent = "Eigenes Training erstellen";
  saveBtn.textContent = "Training speichern";
  createForm.reset();
  equipmentSelected = new Set();
  renderEquipmentCheckboxes();
  resetBuilder();
  createOverlay.classList.remove("hidden");
  lockBodyScroll();
}

function openEdit(drill) {
  editingDrillId = drill.id;
  editingIsCustom = !!drill.custom;
  createTitleEl.textContent = "Training bearbeiten";
  saveBtn.textContent = "Änderungen speichern";

  document.getElementById("f-title").value = drill.title || "";
  document.getElementById("f-category").value = drill.category || "";
  document.getElementById("f-difficulty").value = drill.difficulty || "";
  document.getElementById("f-rounds").value = drill.rounds || "";
  document.getElementById("f-distance").value = drill.distance || "";
  document.getElementById("f-partime").value = drill.parTime || "";
  document.getElementById("f-procedure").value = drill.procedure || "";
  document.getElementById("f-focus").value = drill.focus || "";

  equipmentSelected = new Set(drill.equipment || []);
  renderEquipmentCheckboxes();

  builderLayout = drill.layout
    ? { ...emptyBuilderLayout(), ...JSON.parse(JSON.stringify(drill.layout)) }
    : emptyBuilderLayout();
  pendingPoint = null;
  historyStack = [];
  renderBuilderPreview();

  createOverlay.classList.remove("hidden");
  lockBodyScroll();
}

function closeCreate() {
  createOverlay.classList.add("hidden");
  editingDrillId = null;
  unlockBodyScroll();
}

function handleCreateSubmit(e) {
  e.preventDefault();

  const title = document.getElementById("f-title").value.trim();
  const category = document.getElementById("f-category").value.trim();
  const procedure = document.getElementById("f-procedure").value.trim();
  if (!title || !category || !procedure) return;

  const roundsRaw = document.getElementById("f-rounds").value.trim();
  const fields = {
    title,
    category,
    difficulty: document.getElementById("f-difficulty").value.trim(),
    equipment: [...equipmentSelected],
    rounds: roundsRaw ? parseInt(roundsRaw, 10) : null,
    distance: document.getElementById("f-distance").value.trim(),
    parTime: document.getElementById("f-partime").value.trim(),
    procedure,
    focus: document.getElementById("f-focus").value.trim(),
    layout: JSON.parse(JSON.stringify(builderLayout))
  };

  if (editingDrillId) {
    if (editingIsCustom) {
      const idx = customDrills.findIndex(d => d.id === editingDrillId);
      if (idx >= 0) customDrills[idx] = { ...customDrills[idx], ...fields };
      saveCustomDrills();
    } else {
      editedBuiltins[editingDrillId] = { ...fields, id: editingDrillId, custom: false, builtinEdited: true };
      saveEditedBuiltins();
    }
  } else {
    customDrills.push({ id: "custom-" + Date.now(), custom: true, ...fields });
    saveCustomDrills();
  }

  mergeDrills();
  populateFilters();
  updateRestoreButton();
  render();
  closeCreate();
}

// ---------- Equipment multiselect ----------

function initEquipmentMultiselect() {
  const btn = document.getElementById("equipment-ms-btn");
  const panel = document.getElementById("equipment-ms-panel");
  const ms = document.getElementById("equipment-multiselect");
  const addBtn = document.getElementById("equipment-add-btn");
  const newInput = document.getElementById("equipment-new-input");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("hidden");
  });
  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("hidden") && !ms.contains(e.target)) panel.classList.add("hidden");
  });
  addBtn.addEventListener("click", () => {
    const val = newInput.value.trim();
    if (!val) return;
    equipmentSelected.add(val);
    newInput.value = "";
    renderEquipmentCheckboxes();
  });
  newInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); addBtn.click(); }
  });
}

function renderEquipmentCheckboxes() {
  const container = document.getElementById("equipment-checkboxes");
  const allTags = uniqueSorted(DRILLS.flatMap(d => d.equipment || []));
  const tags = uniqueSorted([...new Set([...allTags, ...equipmentSelected])]);

  container.innerHTML = tags.map(tag => `
    <label><input type="checkbox" value="${escapeHtml(tag)}" ${equipmentSelected.has(tag) ? "checked" : ""}> ${escapeHtml(tag)}</label>
  `).join("");

  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) equipmentSelected.add(cb.value); else equipmentSelected.delete(cb.value);
      updateEquipmentButtonLabel();
    });
  });
  updateEquipmentButtonLabel();
}

function updateEquipmentButtonLabel() {
  const btn = document.getElementById("equipment-ms-btn");
  btn.textContent = equipmentSelected.size ? [...equipmentSelected].join(", ") : "Auswählen…";
}

// ---------- Export / Import / Share ----------

function downloadJSON(content, filename) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugify(str) {
  return String(str).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 60) || "training";
}

function exportAll() {
  const includeScores = exportIncludeScoresCheckbox.checked;
  const payload = {
    type: "ipsc-training-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    customDrills,
    editedBuiltins,
    deletedBuiltinIds,
    ...(includeScores ? { scoreLogs, favorites: [...favorites] } : {})
  };
  downloadJSON(JSON.stringify(payload, null, 2), "ipsc-training-export.json");
  showDbMsg(includeScores
    ? "Export (inkl. eigener Zeiten und Favoriten) heruntergeladen."
    : "Export heruntergeladen – Datei an Kollegen weitergeben, die können sie importieren.");
}

function stripForSharing(drill) {
  const { title, category, difficulty, equipment, rounds, distance, parTime, procedure, focus, layout, courseType } = drill;
  return { title, category, difficulty, equipment, rounds, distance, parTime, procedure, focus, layout, courseType };
}

async function shareDrill(drill) {
  const payload = { type: "ipsc-training-drill", version: 1, drill: stripForSharing(drill) };
  const json = JSON.stringify(payload, null, 2);
  const filename = "ipsc-" + slugify(drill.title) + ".json";

  // Mobile: use the native share sheet so it can go straight to WhatsApp/Mail/etc.
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([json], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: drill.title });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return; // user cancelled the share sheet, don't also download
    }
  }

  // Desktop (and any browser without file-sharing support): download a real file to send on
  downloadJSON(json, filename);
  showDbMsg(`"${drill.title}" als Datei "${filename}" heruntergeladen – kannst du direkt an Kollegen weitergeben (z.B. per Mail oder Chat anhängen).`);
}

function importFile(file) {
  if (file.size > 20 * 1024 * 1024) {
    alert("Die Datei ist zu groß für einen Trainings-Import (maximal 20 MB).");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(reader.result);
    } catch (e) {
      alert("Import fehlgeschlagen: Die Datei ist keine gültige JSON-Datei.");
      return;
    }
    if (!data || typeof data !== "object") {
      alert("Unbekanntes Dateiformat – das ist keine IPSC-Trainings-Export-Datei.");
      return;
    }

    const builtinIds = new Set((window.IPSC_DRILLS || []).map(d => d.id));

    if (data.type === "ipsc-training-export") {
      const fingerprints = new Map(customDrills.map(d => [drillFingerprint(d), d.id]));
      const existingIds = new Set(customDrills.map(d => d.id));
      const idMap = {}; // ID in der Datei -> ID in dieser App
      let added = 0, duplicates = 0, invalid = 0, keptLocalEdits = 0, scoresAdded = 0;

      for (const raw of cleanArr(data.customDrills, 5000)) {
        const clean = sanitizeDrill(raw);
        if (!clean) { invalid++; continue; }
        const fp = JSON.stringify(clean);
        const srcId = raw && cleanId(raw.id);
        if (fingerprints.has(fp)) {
          // Gleiches Training ist schon da: nicht doppelt anlegen, Ergebnisse aber zuordnen
          if (srcId) idMap[srcId] = fingerprints.get(fp);
          duplicates++;
          continue;
        }
        const id = srcId && !existingIds.has(srcId) ? srcId : newCustomId();
        customDrills.push({ ...clean, id, custom: true });
        existingIds.add(id);
        fingerprints.set(fp, id);
        if (srcId) idMap[srcId] = id;
        added++;
      }

      // Bearbeitete Standard-Trainings: eigene Bearbeitungen haben Vorrang.
      // Löschungen aus fremden Dateien werden bewusst nicht übernommen.
      const incomingEdits = data.editedBuiltins && typeof data.editedBuiltins === "object" ? data.editedBuiltins : {};
      for (const [id, raw] of Object.entries(incomingEdits)) {
        if (!builtinIds.has(id)) continue;
        if (editedBuiltins[id]) { keptLocalEdits++; continue; }
        const clean = sanitizeDrill(raw);
        if (clean) editedBuiltins[id] = { ...clean, id, custom: false, builtinEdited: true };
      }

      if (data.scoreLogs) {
        for (const [srcId, entries] of Object.entries(sanitizeScoreLogs(data.scoreLogs))) {
          const key = idMap[srcId] || (builtinIds.has(srcId) ? srcId : null);
          if (!key) continue; // Ergebnisse ohne zugehöriges Training nicht übernehmen
          const log = scoreLogs[key] || [];
          const seen = new Set(log.map(scoreEntryKey));
          for (const entry of entries) {
            const k = scoreEntryKey(entry);
            if (!seen.has(k)) { log.push(entry); seen.add(k); scoresAdded++; }
          }
          log.sort((a, b) => a.date.localeCompare(b.date));
          scoreLogs[key] = log;
        }
        saveScoreLogs();
      }

      if (Array.isArray(data.favorites)) {
        for (const srcId of data.favorites) {
          const key = typeof srcId === "string" ? (idMap[srcId] || (builtinIds.has(srcId) ? srcId : null)) : null;
          if (key) favorites.add(key);
        }
        saveFavorites();
      }

      saveCustomDrills();
      saveEditedBuiltins();

      const parts = [`${added} Training(s) importiert`];
      if (duplicates) parts.push(`${duplicates} bereits vorhanden (übersprungen)`);
      if (invalid) parts.push(`${invalid} ungültig (ohne Titel/Kategorie)`);
      if (scoresAdded) parts.push(`${scoresAdded} Ergebnis(se) übernommen`);
      if (keptLocalEdits) parts.push(`${keptLocalEdits} eigene Bearbeitung(en) beibehalten`);
      showDbMsg(parts.join(", ") + ".");
    } else if (data.type === "ipsc-training-drill" && data.drill) {
      const clean = sanitizeDrill(data.drill);
      if (!clean) {
        alert("Import fehlgeschlagen: Dem Training fehlen Titel oder Kategorie.");
        return;
      }
      const fp = JSON.stringify(clean);
      if (customDrills.some(d => drillFingerprint(d) === fp)) {
        showDbMsg(`"${clean.title}" ist bereits vorhanden und wurde nicht erneut importiert.`);
        return;
      }
      customDrills.push({ ...clean, id: newCustomId(), custom: true });
      saveCustomDrills();
      showDbMsg(`"${clean.title}" importiert.`);
    } else {
      alert("Unbekanntes Dateiformat – das ist keine IPSC-Trainings-Export-Datei.");
      return;
    }

    mergeDrills();
    populateFilters();
    updateRestoreButton();
    render();
  };
  reader.onerror = () => alert("Die Datei konnte nicht gelesen werden.");
  reader.readAsText(file);
}

// ---------- Stage builder (click-to-place + drag-to-move, same renderer as built-in drills) ----------

function resetBuilder() {
  builderLayout = emptyBuilderLayout();
  pendingPoint = null;
  historyStack = [];
  renderBuilderPreview();
}

function initBuilder() {
  if (!builderSvg) return;

  document.querySelectorAll(".tool-select").forEach(btn => {
    const icon = toolIconSvg(btn.dataset.tool);
    if (icon) {
      btn.textContent = btn.textContent.replace("⬤", "").trim();
      btn.insertAdjacentHTML("afterbegin", `<span class="tool-icon" aria-hidden="true">${icon}</span>`);
    }
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tool-select").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      builderTool = btn.dataset.tool;
      pendingPoint = null;
      if (builderHint) builderHint.textContent = (TOOL_HINTS[builderTool] || "") + DRAG_HINT;
      renderBuilderPreview();
    });
  });

  builderSvg.addEventListener("pointerdown", onBuilderPointerDown);
  builderSvg.addEventListener("pointermove", onBuilderPointerMove);
  builderSvg.addEventListener("pointerup", onBuilderPointerUp);
  builderSvg.addEventListener("pointerleave", () => { dragState = null; pointerDownPoint = null; });

  document.getElementById("rotate-shooter-btn").addEventListener("click", () => {
    const last = builderLayout.shooterPositions[builderLayout.shooterPositions.length - 1];
    if (!last) return;
    last.facing = ((last.facing || 0) + 45) % 360;
    renderBuilderPreview();
  });

  document.getElementById("undo-btn").addEventListener("click", undoBuilder);
  document.getElementById("clear-builder-btn").addEventListener("click", resetBuilder);

  if (builderHint) builderHint.textContent = (TOOL_HINTS[builderTool] || "") + DRAG_HINT;
  resetBuilder();
}

function svgPoint(e) {
  const rect = builderSvg.getBoundingClientRect();
  const scaleX = builderLayout.viewW / rect.width;
  const scaleY = builderLayout.viewH / rect.height;
  return {
    x: Math.round((e.clientX - rect.left) * scaleX),
    y: Math.round((e.clientY - rect.top) * scaleY)
  };
}

function hitTestBuilder(p) {
  for (let i = builderLayout.targets.length - 1; i >= 0; i--) {
    const t = builderLayout.targets[i];
    if (Math.hypot(t.x - p.x, t.y - p.y) <= 24) return { kind: "target", index: i };
  }
  for (let i = builderLayout.shooterPositions.length - 1; i >= 0; i--) {
    const s = builderLayout.shooterPositions[i];
    if (Math.hypot(s.x - p.x, s.y - p.y) <= 18) return { kind: "shooter", index: i };
  }
  for (let i = builderLayout.boxes.length - 1; i >= 0; i--) {
    const b = builderLayout.boxes[i];
    if (p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) return { kind: "box", index: i };
  }
  if (builderLayout.props) {
    for (let i = builderLayout.props.length - 1; i >= 0; i--) {
      const pr = builderLayout.props[i];
      if (Math.hypot(pr.x - p.x, pr.y - p.y) <= 26) return { kind: "prop", index: i };
    }
  }
  for (let i = builderLayout.walls.length - 1; i >= 0; i--) {
    const w = builderLayout.walls[i];
    if (Math.hypot(w.x1 - p.x, w.y1 - p.y) <= 14) return { kind: "wall-start", index: i };
    if (Math.hypot(w.x2 - p.x, w.y2 - p.y) <= 14) return { kind: "wall-end", index: i };
  }
  if (builderLayout.path) {
    for (let i = builderLayout.path.length - 1; i >= 0; i--) {
      const pt = builderLayout.path[i];
      if (Math.hypot(pt[0] - p.x, pt[1] - p.y) <= 14) return { kind: "path-point", index: i };
    }
  }
  return null;
}

function onBuilderPointerDown(e) {
  const p = svgPoint(e);
  const hit = hitTestBuilder(p);
  didDrag = false;
  pointerDownPoint = p;

  if (hit) {
    let offsetX = 0, offsetY = 0;
    if (hit.kind === "box") {
      const b = builderLayout.boxes[hit.index];
      offsetX = p.x - b.x;
      offsetY = p.y - b.y;
    }
    dragState = { ...hit, offsetX, offsetY };
    try { builderSvg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  } else {
    dragState = null;
  }
}

function onBuilderPointerMove(e) {
  if (!dragState || !pointerDownPoint) return;
  if (builderTool === "delete") return; // delete tool never moves elements, only removes them on release
  const p = svgPoint(e);
  if (!didDrag && Math.hypot(p.x - pointerDownPoint.x, p.y - pointerDownPoint.y) > 2) didDrag = true;
  if (!didDrag) return;

  if (dragState.kind === "target") {
    builderLayout.targets[dragState.index].x = p.x;
    builderLayout.targets[dragState.index].y = p.y;
  } else if (dragState.kind === "shooter") {
    builderLayout.shooterPositions[dragState.index].x = p.x;
    builderLayout.shooterPositions[dragState.index].y = p.y;
  } else if (dragState.kind === "box") {
    const b = builderLayout.boxes[dragState.index];
    b.x = p.x - dragState.offsetX;
    b.y = p.y - dragState.offsetY;
  } else if (dragState.kind === "wall-start") {
    const w = builderLayout.walls[dragState.index];
    w.x1 = p.x; w.y1 = p.y;
  } else if (dragState.kind === "wall-end") {
    const w = builderLayout.walls[dragState.index];
    w.x2 = p.x; w.y2 = p.y;
  } else if (dragState.kind === "path-point") {
    builderLayout.path[dragState.index] = [p.x, p.y];
  } else if (dragState.kind === "prop") {
    builderLayout.props[dragState.index].x = p.x;
    builderLayout.props[dragState.index].y = p.y;
  }
  renderBuilderPreview();
}

function onBuilderPointerUp(e) {
  const wasHit = dragState;
  dragState = null;
  pointerDownPoint = null;

  if (wasHit) {
    if (builderTool === "delete") {
      deleteElement(wasHit);
      renderBuilderPreview();
    }
    didDrag = false;
    return;
  }

  placeAtPoint(svgPoint(e));
}

function deleteElement(hit) {
  if (hit.kind === "target") builderLayout.targets.splice(hit.index, 1);
  else if (hit.kind === "shooter") builderLayout.shooterPositions.splice(hit.index, 1);
  else if (hit.kind === "box") builderLayout.boxes.splice(hit.index, 1);
  else if (hit.kind === "prop") builderLayout.props.splice(hit.index, 1);
  else if (hit.kind === "wall-start" || hit.kind === "wall-end") builderLayout.walls.splice(hit.index, 1);
  else if (hit.kind === "path-point") builderLayout.path.splice(hit.index, 1);
}

function placeAtPoint(p) {
  if (builderTool === "target") {
    builderLayout.targets.push({ x: p.x, y: p.y, type: "paper", label: "T" + (builderLayout.targets.filter(t => t.type === "paper").length + 1) });
    historyStack.push({ type: "targets" });
  } else if (builderTool === "steel") {
    builderLayout.targets.push({ x: p.x, y: p.y, type: "steel", label: "S" + (builderLayout.targets.filter(t => t.type === "steel").length + 1) });
    historyStack.push({ type: "targets" });
  } else if (builderTool === "popper") {
    builderLayout.targets.push({ x: p.x, y: p.y, type: "popper", label: "P" + (builderLayout.targets.filter(t => t.type === "popper").length + 1) });
    historyStack.push({ type: "targets" });
  } else if (builderTool === "pendler") {
    builderLayout.targets.push({ x: p.x, y: p.y, type: "pendler", label: "PD" + (builderLayout.targets.filter(t => t.type === "pendler").length + 1) });
    historyStack.push({ type: "targets" });
  } else if (builderTool === "updown") {
    builderLayout.targets.push({ x: p.x, y: p.y, type: "updown", label: "UD" + (builderLayout.targets.filter(t => t.type === "updown").length + 1) });
    historyStack.push({ type: "targets" });
  } else if (builderTool === "noshoot") {
    builderLayout.targets.push({ x: p.x, y: p.y, type: "noshoot", label: "NS" + (builderLayout.targets.filter(t => t.type === "noshoot").length + 1) });
    historyStack.push({ type: "targets" });
  } else if (builderTool === "shooter") {
    builderLayout.shooterPositions.push({ x: p.x, y: p.y, facing: 0, label: builderLayout.shooterPositions.length === 0 ? "Start" : "Position " + (builderLayout.shooterPositions.length + 1) });
    historyStack.push({ type: "shooterPositions" });
  } else if (builderTool === "wall") {
    if (!pendingPoint) {
      pendingPoint = p;
    } else {
      builderLayout.walls.push({ x1: pendingPoint.x, y1: pendingPoint.y, x2: p.x, y2: p.y });
      historyStack.push({ type: "walls" });
      pendingPoint = null;
    }
  } else if (builderTool === "box") {
    if (!pendingPoint) {
      pendingPoint = p;
    } else {
      const x = Math.min(pendingPoint.x, p.x), y = Math.min(pendingPoint.y, p.y);
      const w = Math.abs(p.x - pendingPoint.x) || 40, h = Math.abs(p.y - pendingPoint.y) || 40;
      builderLayout.boxes.push({ x, y, w, h, label: "Box " + (builderLayout.boxes.length + 1) });
      historyStack.push({ type: "boxes" });
      pendingPoint = null;
    }
  } else if (builderTool === "tisch") {
    builderLayout.props.push({ x: p.x, y: p.y, type: "tisch", label: "Tisch" });
    historyStack.push({ type: "props" });
  } else if (builderTool === "sessel") {
    builderLayout.props.push({ x: p.x, y: p.y, type: "sessel", label: "Sessel" });
    historyStack.push({ type: "props" });
  }

  renderBuilderPreview();
}

function undoBuilder() {
  const last = historyStack.pop();
  if (!last) return;
  builderLayout[last.type].pop();
  renderBuilderPreview();
}

function renderBuilderPreview() {
  if (!builderSvg) return;
  let extra = "";

  if (pendingPoint) {
    extra += `<circle cx="${pendingPoint.x}" cy="${pendingPoint.y}" r="5" fill="none" stroke="#e8620c" stroke-width="2" stroke-dasharray="3,2"/>`;
  }

  builderSvg.innerHTML = `
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#8a92a0"/>
      </marker>
    </defs>
    ${renderLayoutInner(builderLayout)}
    ${extra}
  `;
}

// ---------- SVG Layout Renderer ----------

function renderLayoutInner(layout) {
  const w = layout.viewW || 400;
  const h = layout.viewH || 500;
  let parts = [];

  parts.push(gridBackground(w, h));

  for (const wall of layout.walls || []) {
    parts.push(`<line x1="${wall.x1}" y1="${wall.y1}" x2="${wall.x2}" y2="${wall.y2}" stroke="#c9cdd3" stroke-width="8" stroke-linecap="round"/>`);
  }

  for (const box of layout.boxes || []) {
    parts.push(`<rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="none" stroke="#5a6270" stroke-width="2" stroke-dasharray="6,4"/>`);
  }

  for (const prop of layout.props || []) {
    parts.push(propEl(prop));
  }

  if (layout.path && layout.path.length > 1) {
    const points = layout.path.map(p => p.join(",")).join(" ");
    parts.push(`<polyline points="${points}" fill="none" stroke="#8a92a0" stroke-width="2" stroke-dasharray="5,5" marker-end="url(#arrow)"/>`);
  }

  if (layout.dotsGrid) {
    parts.push(dotsGridEl(layout.dotsGrid));
  }

  for (const t of layout.targets || []) {
    parts.push(targetEl(t));
  }

  for (const s of layout.shooterPositions || []) {
    parts.push(shooterEl(s));
  }

  return parts.join("\n");
}

function renderLayout(layout) {
  const w = layout.viewW || 400;
  const h = layout.viewH || 500;
  return `
  <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" width="360">
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#8a92a0"/>
      </marker>
    </defs>
    ${renderLayoutInner(layout)}
  </svg>`;
}

function gridBackground(w, h) {
  let lines = [];
  for (let x = 0; x <= w; x += 40) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#1a1d22" stroke-width="1"/>`);
  }
  for (let y = 0; y <= h; y += 40) {
    lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#1a1d22" stroke-width="1"/>`);
  }
  return `<rect x="0" y="0" width="${w}" height="${h}" fill="#0b0d10"/>${lines.join("")}`;
}

function textEl(x, y, str, color, size) {
  return `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" text-anchor="middle" font-family="Segoe UI, sans-serif">${escapeXml(str)}</text>`;
}

function escapeXml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


// Zielsymbole im Stil der IPSC-Stagebeschreibungen:
// braunes Achteck mit C- und A-Zone, hellblauer Popper und hellblaue Plate,
// jeweils mit schwarzer Kontur.
// (Farben und Umrisse der Zielsymbole stehen oben bei den Konstanten.)

function shapePoints(shape, cx, cy, hw = TARGET_HW, hh = TARGET_HH) {
  return shape.map(([nx, ny]) => `${+(cx + nx * hw).toFixed(2)},${+(cy + ny * hh).toFixed(2)}`).join(" ");
}

function targetZonesSvg(cx, cy) {
  return `
    <polygon points="${shapePoints(TARGET_OUTLINE, cx, cy)}" fill="${TARGET_TAN}" stroke="${TARGET_STROKE}" stroke-width="1.5" stroke-linejoin="round"/>
    <polygon points="${shapePoints(TARGET_C_ZONE, cx, cy)}" fill="none" stroke="${TARGET_STROKE}" stroke-width="0.85" stroke-linejoin="round"/>
    <polygon points="${shapePoints(TARGET_A_ZONE, cx, cy)}" fill="none" stroke="${TARGET_STROKE}" stroke-width="0.85" stroke-linejoin="round"/>`;
}

function plateSvg(cx, cy) {
  return `<circle cx="${cx}" cy="${cy}" r="12" fill="${STEEL_BLUE}" stroke="${ICON_STROKE}" stroke-width="1"/>`;
}

function popperSvg(cx, cy) {
  // Runder Kopf, darunter ein nach unten schmaler werdender Körper mit gerader Standfläche
  const rx = 11, ry = 8.5, headCy = cy - 14.5;
  const neckHw = 7.3, footHw = 5.6, footY = cy + 23;
  const neckY = headCy + ry * Math.sqrt(1 - (neckHw / rx) ** 2);
  const f = v => +v.toFixed(2);
  return `<path d="M ${f(cx - neckHw)} ${f(neckY)} A ${rx} ${ry} 0 1 1 ${f(cx + neckHw)} ${f(neckY)} L ${f(cx + footHw)} ${f(footY)} L ${f(cx - footHw)} ${f(footY)} Z" fill="${STEEL_BLUE}" stroke="${ICON_STROKE}" stroke-width="1" stroke-linejoin="round"/>`;
}

function targetEl(t) {
  const labelAt = dy => textEl(t.x, t.y + dy, t.label, "#8a92a0", 11);

  if (t.type === "steel") return plateSvg(t.x, t.y) + labelAt(26);

  if (t.type === "popper") return popperSvg(t.x, t.y) + labelAt(37);

  if (t.type === "noshoot") {
    // No-Shoot: gleiche Silhouette, weiß und ohne Trefferzonen
    return `<polygon points="${shapePoints(TARGET_OUTLINE, t.x, t.y)}" fill="#f5f3ee" stroke="${ICON_STROKE}" stroke-width="1.5" stroke-linejoin="round"/>` + labelAt(39);
  }

  if (t.type === "pendler") {
    // Pendler: Papierziel mit gestrichelter Schwungbahn
    const arcY = t.y - 20;
    return `
      <g>
        <path d="M ${t.x - 40} ${arcY} A 42 42 0 0 1 ${t.x + 40} ${arcY}" fill="none" stroke="#8a92a0" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="${t.x - 40}" cy="${arcY}" r="2.5" fill="#8a92a0"/>
        <circle cx="${t.x + 40}" cy="${arcY}" r="2.5" fill="#8a92a0"/>
        <line x1="${t.x}" y1="${t.y - 50}" x2="${t.x}" y2="${t.y - TARGET_HH}" stroke="#5a6270" stroke-width="2"/>
        ${targetZonesSvg(t.x, t.y)}
      </g>` + labelAt(39);
  }

  if (t.type === "updown") {
    // Up-Down-Ziel: Papierziel mit Pfeil nach oben und unten
    const ax = t.x + 30, ay = t.y;
    return `
      <g>
        ${targetZonesSvg(t.x, t.y)}
        <g stroke="#8a92a0" stroke-width="2" fill="none">
          <line x1="${ax}" y1="${ay - 14}" x2="${ax}" y2="${ay + 14}"/>
          <path d="M ${ax - 4} ${ay - 9} L ${ax} ${ay - 15} L ${ax + 4} ${ay - 9}"/>
          <path d="M ${ax - 4} ${ay + 9} L ${ax} ${ay + 15} L ${ax + 4} ${ay + 9}"/>
        </g>
      </g>` + labelAt(39);
  }

  // Papierziel
  const headZone = t.headZone
    ? `<circle cx="${t.x}" cy="${t.y - TARGET_HH - 10}" r="10" fill="${TARGET_TAN}" stroke="${TARGET_STROKE}" stroke-width="1.5"/>`
    : "";
  return `<g>${headZone}${targetZonesSvg(t.x, t.y)}</g>` + labelAt(39);
}

// Kleine Symbole für die Werkzeugleiste des Skizzen-Editors
function toolIconSvg(tool) {
  const icons = {
    target: `<svg viewBox="-26 -28 52 56">${targetZonesSvg(0, 0)}</svg>`,
    steel: `<svg viewBox="-15 -15 30 30">${plateSvg(0, 0)}</svg>`,
    popper: `<svg viewBox="-15 -25 30 50">${popperSvg(0, 0)}</svg>`,
    noshoot: `<svg viewBox="-26 -28 52 56"><polygon points="${shapePoints(TARGET_OUTLINE, 0, 0)}" fill="#f5f3ee" stroke="${ICON_STROKE}" stroke-width="2.5"/></svg>`
  };
  return icons[tool] || "";
}

function propEl(p) {
  const label = textEl(p.x, p.y + 34, p.label, "#8a92a0", 11);

  if (p.type === "tisch") {
    return `
      <g>
        <rect x="${p.x - 26}" y="${p.y - 16}" width="52" height="32" rx="3" fill="#8a5a3a" stroke="#4a3320" stroke-width="2"/>
        <circle cx="${p.x - 20}" cy="${p.y - 10}" r="2" fill="#4a3320"/>
        <circle cx="${p.x + 20}" cy="${p.y - 10}" r="2" fill="#4a3320"/>
        <circle cx="${p.x - 20}" cy="${p.y + 10}" r="2" fill="#4a3320"/>
        <circle cx="${p.x + 20}" cy="${p.y + 10}" r="2" fill="#4a3320"/>
      </g>` + label;
  }

  if (p.type === "sessel") {
    return `
      <g>
        <rect x="${p.x - 14}" y="${p.y - 14}" width="28" height="26" rx="3" fill="#8a5a3a" stroke="#4a3320" stroke-width="2"/>
        <rect x="${p.x - 14}" y="${p.y - 18}" width="28" height="6" rx="2" fill="#6b4429" stroke="#4a3320" stroke-width="1.5"/>
      </g>` + label;
  }

  return "";
}

function dotsGridEl(dg) {
  let els = [];
  const totalW = (dg.cols - 1) * dg.spacing;
  const startX = dg.x - totalW / 2;
  let n = 1;
  for (let row = 0; row < dg.rows; row++) {
    for (let col = 0; col < dg.cols; col++) {
      const cx = startX + col * dg.spacing;
      const cy = dg.y + row * dg.spacing;
      els.push(`<circle cx="${cx}" cy="${cy}" r="${dg.r}" fill="${TARGET_TAN}" stroke="${TARGET_STROKE}" stroke-width="1.5"/>`);
      els.push(textEl(cx, cy + 4, n, "#000", 11));
      n++;
    }
  }
  return `<g>${els.join("")}</g>`;
}

function shooterEl(s) {
  const rad = (s.facing || 0) * Math.PI / 180;
  const size = 12;
  const tipX = s.x + Math.sin(rad) * size;
  const tipY = s.y - Math.cos(rad) * size;
  const baseAngle1 = rad + (150 * Math.PI / 180);
  const baseAngle2 = rad - (150 * Math.PI / 180);
  const b1x = s.x + Math.sin(baseAngle1) * size;
  const b1y = s.y - Math.cos(baseAngle1) * size;
  const b2x = s.x + Math.sin(baseAngle2) * size;
  const b2y = s.y - Math.cos(baseAngle2) * size;

  return `
    <g>
      <polygon points="${tipX},${tipY} ${b1x},${b1y} ${b2x},${b2y}" fill="#e8620c"/>
      ${textEl(s.x, s.y + 26, s.label, "#e8620c", 11)}
    </g>`;
}
