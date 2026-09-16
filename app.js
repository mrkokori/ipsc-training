let DRILLS = [];
let customDrills = [];
let editedBuiltins = {};
let deletedBuiltinIds = [];
let scoreLogs = {};
let favorites = new Set();
let sessions = [];
let systemThemeQuery = null; // für „Design wie am Gerät“
let matches = [];
let customPlans = [];
let planProgress = {};

// Versionsnummer der App. Bei jeder Veröffentlichung hier UND in sw.js erhöhen.
const APP_VERSION = "2026.09.13";

const CUSTOM_STORAGE_KEY = "ipscCustomDrills";
const EDITED_BUILTINS_KEY = "ipscEditedBuiltins";
const DELETED_BUILTINS_KEY = "ipscDeletedBuiltins";
const SCORE_LOG_KEY = "ipscScoreLogs";
const STORAGE_WARNING_KEY = "ipscStorageWarningDismissedV2";
const FAVORITES_KEY = "ipscFavorites";
const SETTINGS_KEY = "ipscSettings";

// Einstellungen
const TIMER_DELAYS = { "2-4": "zufällig 2–4 s", "1-3": "zufällig 1–3 s", "3-3": "fest 3 s" };
const DEFAULT_SETTINGS = {
  powerFactor: "minor", timerDelay: "2-4", timerReps: 1,
  theme: "dark", fontSize: "normal", magCapacity: 15, chamberLoaded: true, micSensitivity: 6
};
const SESSIONS_KEY = "ipscSessions";
const MATCHES_KEY = "ipscMatches";
const PLANS_KEY = "ipscPlans";
const PLAN_PROGRESS_KEY = "ipscPlanProgress";
const LAST_EXPORT_KEY = "ipscLastExportAt";
const EXPORT_REMINDER_DAYS = 10;
const DIVISIONS = ["Production", "Production Optics", "Standard", "Open", "Classic", "Revolver", "PCC"];
const THEMES = ["dark", "light", "system"];

// Schüsse, die ein Ziel mindestens verlangt (Papier 2, Stahl 1)
const ROUNDS_PER_TARGET = { paper: 2, mini: 2, pendler: 2, updown: 2, mover: 2, dropturner: 2, clamshell: 2, steel: 1, popper: 1, minipopper: 1, noshoot: 0, metalns: 0 };
const NO_SHOOT_TYPES = ["noshoot", "metalns"];

// IPSC-Zielscheibe in Originalgröße (cm) für die Druckvorlage
const PRINT_TARGET_W_CM = 45;
const PRINT_TARGET_H_CM = 57;
let settings = { ...DEFAULT_SETTINGS };

// Erlaubte Werte für die Datenprüfung importierter/gespeicherter Trainings
const TARGET_TYPES = ["paper", "mini", "steel", "popper", "minipopper", "metalns", "pendler", "updown", "mover", "dropturner", "clamshell", "noshoot"];
const PROP_TYPES = ["tisch", "sessel", "fass", "port", "tuer"];
const HARDCOVER_SIDES = ["left", "right", "top", "bottom"];
// Skizzen-Einheiten pro Meter (Raster). Die Symbole sind nicht maßstäblich.
const GRID_UNIT = 20;
const SKETCH_DATA_URL_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/;

// Zielsymbole (oben, weil die Werkzeugleiste schon beim Start gezeichnet wird)
const TARGET_TAN = "#c79c71";
const TARGET_STROKE = "#111111";
const STEEL_BLUE = "#5dc9f8";
const ICON_STROKE = "#111111";

// Maße eines Papierziels in der Skizze (halbe Breite / halbe Höhe)
const TARGET_HW = 22;
const TARGET_HH = 25;
const MINI_HW = 13;
const MINI_HH = 15;

// Umrisse als Anteile von halber Breite (x) und halber Höhe (y), abgenommen vom Stagebook-Symbol
const TARGET_OUTLINE = [[-0.34, -1], [0.34, -1], [1, -0.34], [1, 0.34], [0.34, 1], [-0.34, 1], [-1, 0.34], [-1, -0.34]];
const TARGET_C_ZONE = [[-0.36, -1], [-0.63, -0.34], [-0.63, 0.15], [-0.22, 0.57], [0.22, 0.57], [0.63, 0.15], [0.63, -0.34], [0.36, -1]];
const TARGET_A_ZONE = [[-0.12, -0.89], [-0.32, -0.36], [-0.32, 0], [-0.12, 0.23], [0.12, 0.23], [0.32, 0], [0.32, -0.36], [0.12, -0.89]];

// Par-Timer (Konstanten oben, weil init() beim Start schon darauf zugreift)
const PAR_RESET_MS = 4000;       // Pause zwischen zwei Durchgängen
const NO_PAR_RESET_MS = 8000;    // ohne Par-Zeit etwas mehr Zeit für die Übung
const parTimer = { ctx: null, token: 0, timeouts: [], nodes: [], rafId: 0, wakeLock: null, running: false,
  mic: null, startAudio: null, ignore: [], shots: [], lastShots: [] };

// Teilen per Link
const SHARE_HASH_PREFIX = "#t=";
const SHARE_MULTI_HASH_PREFIX = "#tm=";
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
  return { viewW: 400, viewH: 500, targets: [], shooterPositions: [], walls: [], boxes: [], props: [], path: [], plan: [], faults: [], texts: [] };
}

let builderLayout = emptyBuilderLayout();
let builderTool = "target";
let pendingPoint = null;
let historyStack = [];
let dragState = null;
let pointerDownPoint = null;
let didDrag = false;
// Stage-Editor: Zustand (Bedienung siehe Abschnitt „Stage-Editor“ weiter unten)
// Bedienung: Tippen auf leere Fläche setzt das gewählte Element, Tippen auf ein
// Element wählt es aus, Ziehen verschiebt es. Ziehen auf leerer Fläche oder
// zwei Finger verschieben die Ansicht, Mausrad bzw. zwei Finger zoomen.

const builderView = { x: -20, y: -20, w: 440, h: 540 };
const builderPointers = new Map();
let builderSelection = null;      // { kind, index }
let builderSnap = true;
let builderPanState = null;
let builderPinch = null;
let builderPointerDownClient = null;
let pickActivatorFor = null;      // Index des Ziels, dem gerade ein Auslöser zugewiesen wird

const TARGET_NAMES = {
  paper: "Papierziel", mini: "Mini-Target", noshoot: "No-Shoot", steel: "Plate", popper: "Popper",
  minipopper: "Mini-Popper", metalns: "Metall-No-Shoot", pendler: "Pendler", updown: "Up-Down-Ziel",
  mover: "Mover", dropturner: "Drop Turner", clamshell: "Clamshell"
};
const PROP_NAMES = { tisch: "Tisch", sessel: "Sessel", fass: "Fass", port: "Port / Fenster", tuer: "Tür" };
const LABEL_PREFIX = {
  paper: "T", mini: "MT", noshoot: "NS", steel: "S", popper: "P", minipopper: "MP", metalns: "MNS",
  pendler: "PD", updown: "UD", mover: "MV", dropturner: "DT", clamshell: "CS"
};
const ACTIVATED_TYPES = ["mover", "dropturner", "clamshell"];
const ACTIVATOR_TYPES = ["steel", "popper", "minipopper"];
const HARDCOVER_TYPES = ["paper", "mini", "mover", "dropturner", "clamshell"];


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
  delete: "Tippe auf ein Element, um es zu löschen.",
  select: "Tippe auf ein Element, um es auszuwählen und zu bearbeiten. Ziehen verschiebt es, Ziehen auf freier Fläche verschiebt die Ansicht.",
  mini: "Tippe in die Fläche, um ein Mini-Target zu platzieren.",
  minipopper: "Tippe in die Fläche, um einen Mini-Popper zu platzieren.",
  metalns: "Tippe in die Fläche, um einen Metall-No-Shoot zu platzieren.",
  mover: "Tippe, um einen Mover zu platzieren. Den Auslöser wählst du danach in der Auswahl.",
  dropturner: "Tippe, um einen Drop Turner zu platzieren. Den Auslöser wählst du danach in der Auswahl.",
  clamshell: "Tippe, um ein Clamshell-Ziel zu platzieren. Den Auslöser wählst du danach in der Auswahl.",
  fault: "Erster Tipp = Anfang der Fault Line, zweiter Tipp = Ende.",
  fass: "Tippe, um ein Fass zu platzieren.",
  port: "Tippe, um einen Port (Fenster) zu platzieren. In der Auswahl drehen.",
  tuer: "Tippe, um eine Tür zu platzieren. In der Auswahl drehen.",
  text: "Tippe, um einen Text zu platzieren, und gib ihn in der Auswahl ein.",
  path: "Tippe nacheinander die Punkte des Laufwegs.",
  plan: "Tippe die Ziele in der Reihenfolge an, in der du sie beschießt. Mehrfach antippen ist erlaubt. „Magazinwechsel“ fügt einen Wechsel ein."
};
const DRAG_HINT = " Bereits gesetzte Elemente kannst du direkt anfassen und verschieben.";

// Sammelt Teile der App, die beim Start fehlgeschlagen sind (siehe safeInit unten).
const initFailures = [];

// PWA-Installations-Event (siehe initInstallPrompt weiter unten).
let deferredInstallPrompt = null;

// __proto__/constructor/prototype werden von cleanId() verworfen, weil IDs aus importierten
// oder gespeicherten Dateien später als Objekt-Schlüssel verwendet werden (result[id] = …).
// Sonst könnte eine manipulierte Datei das Prototype eines internen Objekts überschreiben.
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Escaped auch Anführungszeichen, damit maskierte Werte nicht aus einem
// HTML-Attribut ausbrechen können (z.B. value="${escapeHtml(x)}").
const ESCAPE_HTML_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

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
  sessions = sanitizeSessions(loadJSON(SESSIONS_KEY, []));
  matches = sanitizeMatches(loadJSON(MATCHES_KEY, []));
  customPlans = sanitizePlans(loadJSON(PLANS_KEY, []));
  planProgress = sanitizePlanProgress(loadJSON(PLAN_PROGRESS_KEY, {}));
  applyAppearance();
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
  safeInit("Einstellungen", initSettingsDialog);
  safeInit("Trainingstagebuch", initJournal);
  safeInit("Matches", initMatches);
  safeInit("Statistik", initStats);
  safeInit("Trainingspläne", initPlans);
  safeInit("Druckvorlagen", initPrintTargets);
  safeInit("Mehrere teilen", initMultiShare);
  document.getElementById("export-csv-btn").addEventListener("click", exportScoresCsv);
  document.getElementById("update-reload-btn").addEventListener("click", () => location.reload());
  document.getElementById("init-failure-reload-btn").addEventListener("click", reloadAndClearOfflineStorage);
  closeBtn.addEventListener("click", closeDetail);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (closeStageEditor()) return;
      closeDetail(); closeCreate(); closeSettings(); closeJournal(); closePrintTargets(); closeMatches(); closePlans(); closeStats(); closeMultiShare();
    }
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

  safeInit("Stage-Editor", initBuilder);
  safeInit("Ausrüstungsauswahl", initEquipmentMultiselect);

  if (localStorage.getItem(STORAGE_WARNING_KEY) !== "1") storageWarning.classList.remove("hidden");
  storageWarningClose.addEventListener("click", () => {
    storageWarning.classList.add("hidden");
    localStorage.setItem(STORAGE_WARNING_KEY, "1");
  });

  safeInit("Teilen-Link", handleSharedLinkFromUrl);
  safeInit("Offline-Speicher", initServiceWorker);
  safeInit("Installations-Hinweis", initInstallPrompt);
  safeInit("Export-Erinnerung", checkExportReminder);

  if (initFailures.length) showInitFailureWarning();
}

// ---------- App installieren (Android/Chrome) ----------
// iOS/Safari unterstützt beforeinstallprompt nicht – dort bleibt es beim Hinweis
// im Speicher-Warnbanner ("Teilen → Zum Home-Bildschirm").

function initInstallPrompt() {
  const banner = document.getElementById("install-banner");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    banner.classList.remove("hidden");
  });
  document.getElementById("install-btn").addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    banner.classList.add("hidden");
  });
  document.getElementById("install-banner-close").addEventListener("click", () => {
    banner.classList.add("hidden");
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    banner.classList.add("hidden");
  });
}

// ---------- Erinnerung zum Exportieren ----------
// Erinnert alle EXPORT_REMINDER_DAYS Tage ans Sichern, aber nur wenn es überhaupt
// etwas zu sichern gibt – ein frischer, leerer Stand muss niemanden nerven.

function checkExportReminder() {
  const hasData = customDrills.length || sessions.length || matches.length || customPlans.length || Object.keys(editedBuiltins).length;
  if (!hasData) return;
  const last = localStorage.getItem(LAST_EXPORT_KEY);
  const daysSince = last ? (Date.now() - new Date(last).getTime()) / 86400000 : Infinity;
  if (daysSince < EXPORT_REMINDER_DAYS) return;
  const text = document.getElementById("export-reminder-text");
  const label = Number.isFinite(daysSince)
    ? `Dein letzter Export ist ${Math.floor(daysSince)} Tage her.`
    : "Du hast deine Trainings noch nie exportiert.";
  text.textContent = `⭳ ${label} Zur Sicherheit regelmäßig mit „Alles exportieren“ sichern.`;
  document.getElementById("export-reminder-banner").classList.remove("hidden");
  document.getElementById("export-reminder-close").addEventListener("click", () => {
    document.getElementById("export-reminder-banner").classList.add("hidden");
  });
}

// Startet einen Teil der App, ohne dass ein Fehler darin den Rest der Initialisierung
// abbricht (z.B. wenn HTML und app.js kurz nach einem Update aus unterschiedlichen
// Versionen stammen). Betroffene Teile werden in initFailures gesammelt und dem Nutzer angezeigt.
function safeInit(label, fn) {
  try {
    fn();
  } catch (e) {
    console.error(`Initialisierung fehlgeschlagen: ${label}`, e);
    initFailures.push(label);
  }
}

function showInitFailureWarning() {
  const el = document.getElementById("init-failure-warning");
  const text = document.getElementById("init-failure-text");
  if (!el || !text) return;
  text.textContent = `⚠️ Diese Teile der App konnten nicht gestartet werden: ${initFailures.join(", ")}. Das passiert meist kurz nach einem Update, wenn alte und neue Dateien gemischt geladen wurden.`;
  el.classList.remove("hidden");
}

// Löscht zusätzlich zum normalen Neuladen den Offline-Speicher (Service-Worker-Cache),
// damit sich alte und neue Dateiversionen nicht länger mischen können.
async function reloadAndClearOfflineStorage() {
  try {
    if (window.caches) await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch (e) { /* trotzdem neu laden */ }
  location.reload();
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
    timerReps: cleanInt(src.timerReps, DEFAULT_SETTINGS.timerReps, 1, 50),
    theme: THEMES.includes(src.theme) ? src.theme : DEFAULT_SETTINGS.theme,
    fontSize: src.fontSize === "large" ? "large" : "normal",
    magCapacity: cleanInt(src.magCapacity, DEFAULT_SETTINGS.magCapacity, 1, 100),
    chamberLoaded: src.chamberLoaded === undefined ? DEFAULT_SETTINGS.chamberLoaded : !!src.chamberLoaded,
    micSensitivity: cleanInt(src.micSensitivity, DEFAULT_SETTINGS.micSensitivity, 1, 10)
  };
}

// ---------- Darstellung: heller/dunkler Modus, Schriftgröße ----------

function resolvedTheme() {
  if (settings.theme !== "system") return settings.theme;
  return systemThemeQuery && systemThemeQuery.matches ? "light" : "dark";
}

function applyAppearance() {
  const root = document.documentElement;
  if (!systemThemeQuery && window.matchMedia) {
    systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => { if (settings.theme === "system") applyAppearance(); };
    if (systemThemeQuery.addEventListener) systemThemeQuery.addEventListener("change", onChange);
  }
  const theme = resolvedTheme();
  root.dataset.theme = theme;
  root.dataset.fontsize = settings.fontSize;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#f4f5f7" : "#14161a");
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
      timerReps: document.getElementById("set-reps").value,
      theme: document.getElementById("set-theme").value,
      fontSize: document.getElementById("set-fontsize").value,
      magCapacity: document.getElementById("set-magcap").value,
      chamberLoaded: document.getElementById("set-chamber").checked,
      micSensitivity: document.getElementById("set-mic").value
    });
    saveJSON(SETTINGS_KEY, settings);
    applyAppearance();
    closeSettings();
    showDbMsg("Einstellungen gespeichert.");
  });
}

function openSettings() {
  document.getElementById("set-power").value = settings.powerFactor;
  document.getElementById("set-delay").value = settings.timerDelay;
  document.getElementById("set-reps").value = settings.timerReps;
  document.getElementById("set-theme").value = settings.theme;
  document.getElementById("set-fontsize").value = settings.fontSize;
  document.getElementById("set-magcap").value = settings.magCapacity;
  document.getElementById("set-chamber").checked = settings.chamberLoaded;
  document.getElementById("set-mic").value = settings.micSensitivity;
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

// ---------- Schusszahl, Kursart, Magazinplanung ----------

function layoutTargetSummary(layout) {
  const summary = { rounds: 0, paper: 0, popper: 0, plate: 0, noshoot: 0 };
  for (const t of (layout && layout.targets) || []) {
    summary.rounds += ROUNDS_PER_TARGET[t.type] || 0;
    if (t.type === "steel") summary.plate++;
    else if (t.type === "popper" || t.type === "minipopper") summary.popper++;
    else if (NO_SHOOT_TYPES.includes(t.type)) summary.noshoot++;
    else summary.paper++;
  }
  return summary;
}

// Einteilung nach IPSC-Regeln anhand der Schusszahl: Short bis 12, Medium bis 24, Long bis 32
function courseTypeFor(rounds) {
  if (!rounds) return "";
  if (rounds <= 12) return "Short Course";
  if (rounds <= 24) return "Medium Course";
  if (rounds <= 32) return "Long Course";
  return "über 32 Schuss";
}

function minReloads(rounds, capacity = settings.magCapacity, chamber = settings.chamberLoaded) {
  const first = capacity + (chamber ? 1 : 0);
  if (!rounds || rounds <= first) return 0;
  return Math.ceil((rounds - first) / capacity);
}

function briefingHtml(drill) {
  const sum = layoutTargetSummary(drill.layout);
  if (!sum.rounds && !sum.noshoot) return "";
  const rounds = drill.rounds || sum.rounds;
  const reloads = minReloads(rounds);
  const cell = (icon, value, label) => `
    <div class="briefing-cell" title="${label}">
      <div class="briefing-icon" aria-hidden="true">${icon}</div>
      <div class="briefing-value">${value || ""}</div>
      <span class="sr-only">${label}: ${value || 0}</span>
    </div>`;
  const course = drill.courseType || courseTypeFor(rounds);
  return `
    <div class="briefing">
      <div class="briefing-head"><strong>${escapeHtml(course)}</strong><span>${rounds} Schuss${drill.rounds && drill.rounds !== sum.rounds ? ` (Skizze: mind. ${sum.rounds})` : ""}</span></div>
      <div class="briefing-row">
        ${cell(toolIconSvg("target"), sum.paper, "Papierziele")}
        ${cell(toolIconSvg("popper"), sum.popper, "Popper")}
        ${cell(toolIconSvg("steel"), sum.plate, "Plates")}
        ${cell(toolIconSvg("noshoot"), sum.noshoot, "No-Shoots")}
      </div>
      <div class="briefing-foot">${reloads === 0
        ? `Ohne Magazinwechsel machbar (${settings.magCapacity}${settings.chamberLoaded ? "+1" : ""} Schuss)`
        : `Mindestens ${reloads} Magazinwechsel bei ${settings.magCapacity}${settings.chamberLoaded ? "+1" : ""} Schuss`}</div>
    </div>`;
}

function updateBuilderSummary() {
  const el = document.getElementById("builder-summary");
  if (!el) return;
  const sum = layoutTargetSummary(builderLayout);
  const planEl = document.getElementById("builder-plan");
  if (planEl) planEl.innerHTML = planListHtml(builderLayout, { compact: true });
  if (!sum.rounds) { el.innerHTML = ""; return; }
  const parts = [];
  if (sum.paper) parts.push(`${sum.paper} Papier`);
  if (sum.popper) parts.push(`${sum.popper} Popper`);
  if (sum.plate) parts.push(`${sum.plate} Plate${sum.plate > 1 ? "s" : ""}`);
  el.innerHTML = `Laut Skizze: mind. <strong>${sum.rounds} Schuss</strong> (${parts.join(", ")}), ${courseTypeFor(sum.rounds)}
    <button type="button" class="tool-btn" id="builder-take-rounds">Schusszahl übernehmen</button>`;
  document.getElementById("builder-take-rounds").addEventListener("click", () => {
    document.getElementById("f-rounds").value = sum.rounds;
  });
}

// ---------- Schussplan in der Skizze ----------
// Reihenfolge der Ziele und Magazinwechsel, gespeichert als layout.plan:
// [{ type: "target", index }, { type: "reload" }, ...]

function planSteps(layout) {
  const targets = (layout && layout.targets) || [];
  let number = 0;
  return ((layout && layout.plan) || [])
    .filter(step => step.type === "reload" ||
      (step.type === "target" && targets[step.index] && !NO_SHOOT_TYPES.includes(targets[step.index].type)))
    .map(step => {
      if (step.type === "reload") return { type: "reload" };
      const target = targets[step.index];
      return { type: "target", index: step.index, number: ++number, target, rounds: ROUNDS_PER_TARGET[target.type] || 0 };
    });
}

function analyzePlan(layout, capacity = settings.magCapacity, chamber = settings.chamberLoaded) {
  const steps = planSteps(layout);
  const warnings = [];
  let left = capacity + (chamber ? 1 : 0);
  let magazine = 1, total = 0, reloads = 0, warned = false;
  for (const step of steps) {
    if (step.type === "reload") {
      reloads++;
      magazine++;
      left = capacity;
      warned = false;
      continue;
    }
    total += step.rounds;
    left -= step.rounds;
    if (left < 0 && !warned) {
      warnings.push(`Bei Schritt ${step.number} (${step.target.label || "Ziel"}) reicht Magazin ${magazine} nicht mehr – vorher wechseln.`);
      warned = true;
    }
  }
  const planned = new Set(steps.filter(st => st.type === "target").map(st => st.index));
  const missing = ((layout && layout.targets) || [])
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => !NO_SHOOT_TYPES.includes(t.type) && !planned.has(i))
    .map(({ t }) => t.label || "Ziel");
  return { steps, total, reloads, warnings, missing };
}

function planBadgesSvg(layout) {
  const steps = planSteps(layout);
  if (!steps.length) return "";
  const numbers = new Map();
  for (const step of steps) {
    if (step.type !== "target") continue;
    if (!numbers.has(step.index)) numbers.set(step.index, []);
    numbers.get(step.index).push(step.number);
  }
  const out = [];
  for (const [index, nums] of numbers) {
    const t = layout.targets[index];
    const small = { steel: [12, 12], metalns: [12, 12], popper: [11, 23], minipopper: [8, 16], mini: [MINI_HW, MINI_HH] }[t.type];
    const [dx, dy] = small || [TARGET_HW, TARGET_HH];
    const text = nums.join("/");
    const w = Math.max(16, text.length * 6 + 8);
    const x = t.x + dx - 2, y = t.y - dy - 2;
    out.push(`<g class="plan-badge">
      <rect x="${x - w / 2}" y="${y - 8}" width="${w}" height="16" rx="8" fill="#e8620c" stroke="#0b0d10" stroke-width="1"/>
      <text x="${x}" y="${y + 3.5}" fill="#fff" font-size="10" font-weight="700" text-anchor="middle" font-family="Segoe UI, sans-serif">${escapeXml(text)}</text>
    </g>`);
  }
  return out.join("");
}

function planListHtml(layout, { compact = false } = {}) {
  const result = analyzePlan(layout);
  if (!result.steps.length) return "";
  const items = result.steps.map(step => step.type === "reload"
    ? `<li class="plan-reload">Magazinwechsel</li>`
    : `<li><span class="plan-num">${step.number}</span>${escapeHtml(step.target.label || "Ziel")}<span class="plan-rounds">${step.rounds} Schuss</span></li>`).join("");
  return `
    <div class="plan${compact ? " plan-compact" : ""}">
      ${compact ? "" : `<div class="section-title">Schussplan</div>`}
      <ol class="plan-steps">${items}</ol>
      <p class="plan-summary">${result.total} Schuss, ${result.reloads === 0 ? "kein Magazinwechsel" : `${result.reloads} Magazinwechsel`} geplant (Magazin ${settings.magCapacity}${settings.chamberLoaded ? "+1" : ""})</p>
      ${result.warnings.map(w => `<p class="plan-warning">⚠ ${escapeHtml(w)}</p>`).join("")}
      ${result.missing.length ? `<p class="plan-warning">Nicht im Plan: ${escapeHtml(result.missing.join(", "))}</p>` : ""}
    </div>`;
}

function addPlanTarget(index) {
  const target = builderLayout.targets[index];
  if (!target) return;
  if (NO_SHOOT_TYPES.includes(target.type)) {
    if (builderHint) builderHint.textContent = "No-Shoots gehören nicht in den Schussplan.";
    return;
  }
  builderLayout.plan = builderLayout.plan || [];
  builderLayout.plan.push({ type: "target", index });
  historyStack.push({ type: "plan" });
  renderBuilderPreview();
}

// ---------- Match-Analyse ----------

function sanitizeStage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hits = k => cleanInt(raw[k], 0, 0, 500);
  return {
    id: cleanId(raw.id) || newCustomId().replace("custom", "stage"),
    name: cleanStr(raw.name, 80).trim(),
    drillId: cleanId(raw.drillId),
    alpha: hits("alpha"), charlie: hits("charlie"), delta: hits("delta"),
    mike: hits("mike"), noshoot: hits("noshoot"), procedural: hits("procedural"),
    time: cleanNum(raw.time, 0, 0, 3600),
    maxPoints: cleanInt(raw.maxPoints, 0, 0, 5000),
    winnerHF: cleanNum(raw.winnerHF, 0, 0, 100)
  };
}

function sanitizeMatch(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = cleanStr(raw.name, 120).trim();
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  if (!name || !date) return null;
  return {
    id: cleanId(raw.id) || newCustomId().replace("custom", "match"),
    name,
    date,
    division: cleanStr(raw.division, 40).trim(),
    major: !!raw.major,
    notes: cleanStr(raw.notes, 5000),
    stages: cleanArr(raw.stages, 60).map(sanitizeStage).filter(Boolean)
  };
}

function sanitizeMatches(list) { return cleanArr(list, 1000).map(sanitizeMatch).filter(Boolean); }
function saveMatches() { saveJSON(MATCHES_KEY, matches); }

function stageResult(stage, major) {
  const points = calcIpscPoints(stage.alpha, stage.charlie, stage.delta, stage.mike, stage.noshoot, stage.procedural, major);
  const hf = calcHitFactor(points, stage.time);
  const hits = stage.alpha + stage.charlie + stage.delta + stage.mike;
  const maxPoints = stage.maxPoints || hits * 5;
  // Verlorene Punkte gegenüber lauter A-Treffern ohne Strafen
  const lost = {
    charlie: stage.charlie * (major ? 1 : 2),
    delta: stage.delta * (major ? 3 : 4),
    mike: stage.mike * 15,
    noshoot: stage.noshoot * 10,
    procedural: stage.procedural * 10
  };
  const percent = stage.winnerHF > 0 ? Math.min(100, hf / stage.winnerHF * 100) : null;
  return {
    points, hf, maxPoints, lost,
    lostTotal: Object.values(lost).reduce((a, b) => a + b, 0),
    accuracy: maxPoints ? points / maxPoints : null,
    percent,
    stagePoints: percent === null ? null : percent / 100 * maxPoints
  };
}

const LOSS_LABELS = { charlie: "C-Treffer", delta: "D-Treffer", mike: "Misses", noshoot: "No-Shoots", procedural: "Procedurals" };
const LOSS_HINTS = {
  charlie: "je 1 (Major) bzw. 2 (Minor) weniger als A",
  delta: "je 3 (Major) bzw. 4 (Minor) weniger als A",
  mike: "je 10 Strafpunkte, dazu fehlen die 5 Punkte des Treffers",
  noshoot: "je 10 Strafpunkte",
  procedural: "je 10 Strafpunkte"
};

const MATCH_ADVICE = {
  mike: { text: "Misses kosten dich am meisten: je 10 Strafpunkte, und die 5 Punkte des Treffers fehlen zusätzlich. Sichere Treffer vor Tempo.", drills: ["std-precision-distance", "std-doubles", "std-plates"] },
  delta: { text: "Viele D-Treffer: Visierbild bestätigen, bevor der Schuss bricht.", drills: ["std-precision-distance", "std-distance-changes", "std-bill-drill"] },
  charlie: { text: "Viele C-Treffer: Griff und Rückstoßkontrolle verbessern.", drills: ["std-doubles", "std-bill-drill", "std-distance-changes"] },
  noshoot: { text: "No-Shoot-Treffer: Bei teilverdeckten Zielen bewusst genauer zielen.", drills: ["std-partial-targets"] },
  procedural: { text: "Procedurals: Stage-Plan, Laufwege und Fault Lines trocken üben.", drills: ["std-box-to-box", "std-barricade", "std-shooting-on-move"] },
  speed: { text: "Deine Treffer sind gut, verloren geht vor allem Zeit: Ziehen, Zielwechsel und Positionswechsel beschleunigen.", drills: ["std-draw-first-shot", "std-wide-transitions", "std-box-to-box", "std-shot-reload-shot"] }
};

function analyzeMatch(match) {
  const stages = match.stages.map(st => ({ stage: st, result: stageResult(st, match.major) }));
  const sum = (fn) => stages.reduce((n, x) => n + fn(x), 0);
  const points = sum(x => x.result.points);
  const maxPoints = sum(x => x.result.maxPoints);
  const lost = {};
  for (const key of Object.keys(LOSS_LABELS)) lost[key] = sum(x => x.result.lost[key]);
  const withWinner = stages.filter(x => x.result.percent !== null);
  const percent = withWinner.length
    ? withWinner.reduce((n, x) => n + x.result.stagePoints, 0) / withWinner.reduce((n, x) => n + x.result.maxPoints, 0) * 100
    : null;
  const accuracy = maxPoints ? points / maxPoints : null;

  let focus = null;
  const biggestLoss = Object.entries(lost).sort((a, b) => b[1] - a[1])[0];
  if (accuracy !== null && accuracy >= 0.9 && percent !== null && percent < 85) focus = "speed";
  else if (biggestLoss && biggestLoss[1] > 0) focus = biggestLoss[0];
  else if (percent !== null && percent < 85) focus = "speed";

  const ranked = stages.slice().sort((a, b) => {
    const va = a.result.percent !== null ? a.result.percent : (a.result.accuracy || 0) * 100;
    const vb = b.result.percent !== null ? b.result.percent : (b.result.accuracy || 0) * 100;
    return va - vb;
  });
  return { stages, ranked, points, maxPoints, lost, lostTotal: Object.values(lost).reduce((a, b) => a + b, 0), percent, accuracy, focus };
}

// ---------- Statistik: Übersicht über alle Übungen und Trainings hinweg ----------

function initStats() {
  const overlayEl = document.getElementById("stats-overlay");
  document.getElementById("stats-btn").addEventListener("click", openStats);
  document.getElementById("stats-close").addEventListener("click", closeStats);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeStats(); });
}

function openStats() {
  renderStats();
  const overlayEl = document.getElementById("stats-overlay");
  if (overlayEl.classList.contains("hidden")) {
    overlayEl.classList.remove("hidden");
    lockBodyScroll();
  }
}

function closeStats() {
  const overlayEl = document.getElementById("stats-overlay");
  if (!overlayEl || overlayEl.classList.contains("hidden")) return;
  overlayEl.classList.add("hidden");
  unlockBodyScroll();
}

// Alle geloggten Ergebnisse aus allen Übungen zusammen, chronologisch sortiert.
function allScoreEntries() {
  const all = [];
  for (const [drillId, entries] of Object.entries(scoreLogs)) {
    for (const e of entries) all.push({ drillId, ...e });
  }
  return all.sort((a, b) => a.date.localeCompare(b.date));
}

function statsOverview() {
  return {
    sessions: sessions.length,
    roundsTotal: sessions.reduce((n, x) => n + x.rounds, 0),
    resultsTotal: allScoreEntries().length,
    matches: matches.length
  };
}

// Rollierende A-Quote über alle Ergebnisse hinweg (Fenster: letzte 10). Anders als der
// Hit-Factor ist die A-Quote (0–100 %) zwischen unterschiedlichen Übungen vergleichbar,
// deshalb eignet sie sich als übergreifende Trendlinie.
function globalAccuracyTrend(entries, windowSize = 10) {
  return entries.map((_, i) => {
    const slice = entries.slice(Math.max(0, i - windowSize + 1), i + 1);
    const shots = slice.reduce((n, e) => n + e.alpha + e.charlie + e.delta + (e.mike || 0), 0);
    return shots ? slice.reduce((n, e) => n + e.alpha, 0) / shots * 100 : 0;
  });
}

function globalAccuracyChartSvg(entries) {
  const w = 340, h = 150, left = 40, right = 10, top = 12, bottom = 22;
  const values = globalAccuracyTrend(entries);
  const x = i => left + (values.length > 1 ? i * (w - left - right) / (values.length - 1) : 0);
  const y = v => top + (1 - v / 100) * (h - top - bottom);
  const line = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const shortDate = iso => { const d = new Date(iso); return `${d.getDate()}.${d.getMonth() + 1}.`; };
  return `
  <svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Verlauf der A-Quote über alle Übungen">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#0b0d10" rx="6"/>
    <line x1="${left}" y1="${top}" x2="${w - right}" y2="${top}" stroke="#1f232a"/>
    <line x1="${left}" y1="${h - bottom}" x2="${w - right}" y2="${h - bottom}" stroke="#1f232a"/>
    <text x="${left - 4}" y="${top + 4}" fill="#9aa3af" font-size="10" text-anchor="end">100 %</text>
    <text x="${left - 4}" y="${h - bottom + 4}" fill="#9aa3af" font-size="10" text-anchor="end">0 %</text>
    <text x="${left}" y="${h - 6}" fill="#9aa3af" font-size="10">${escapeXml(shortDate(entries[0].date))}</text>
    <text x="${w - right}" y="${h - 6}" fill="#9aa3af" font-size="10" text-anchor="end">${escapeXml(shortDate(entries[entries.length - 1].date))}</text>
    <polyline points="${line}" fill="none" stroke="#e8620c" stroke-width="2"/>
  </svg>`;
}

function monthlySessionCounts(maxMonths = 6) {
  const counts = new Map();
  for (const s of sessions) counts.set(s.date.slice(0, 7), (counts.get(s.date.slice(0, 7)) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-maxMonths);
}

const MONTH_NAMES = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
function formatMonthKey(key) {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}

function topPracticedDrills(limit = 5) {
  return Object.entries(scoreLogs)
    .filter(([, entries]) => entries.length)
    .map(([drillId, entries]) => {
      const drill = DRILLS.find(d => d.id === drillId);
      return { title: drill ? drill.title : drillId, count: entries.length, best: Math.max(...entries.map(e => e.hitFactor)) };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function categoryDistribution() {
  const counts = new Map();
  for (const [drillId, entries] of Object.entries(scoreLogs)) {
    if (!entries.length) continue;
    const cat = (DRILLS.find(d => d.id === drillId) || {}).category || "Unbekannt";
    counts.set(cat, (counts.get(cat) || 0) + entries.length);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function barListHtml(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return `<div class="loss-bars">${rows.map(r => `
    <div class="loss-row">
      <span class="loss-label">${escapeHtml(r.label)}</span>
      <span class="loss-bar"><span data-bar-width="${(r.value / max * 100).toFixed(1)}%"></span></span>
      <span class="loss-value">${escapeHtml(String(r.value))}${r.suffix || ""}</span>
    </div>`).join("")}</div>`;
}

function renderStats() {
  const box = document.getElementById("stats-content");
  const ov = statsOverview();
  const entries = allScoreEntries();
  const months = monthlySessionCounts();
  const top = topPracticedDrills();
  const cats = categoryDistribution();

  box.innerHTML = `
    <h2>Statistik</h2>
    <div class="detail-grid">
      <div class="stat-box"><div class="label">Trainingseinheiten</div><div class="value">${ov.sessions}</div></div>
      <div class="stat-box"><div class="label">Verschossene Patronen</div><div class="value">${ov.roundsTotal}</div></div>
      <div class="stat-box"><div class="label">Erfasste Ergebnisse</div><div class="value">${ov.resultsTotal}</div></div>
      <div class="stat-box"><div class="label">Erfasste Matches</div><div class="value">${ov.matches}</div></div>
    </div>

    ${entries.length >= 2 ? `
    <div class="section-title">A-Quote im Verlauf (alle Übungen)</div>
    <p class="settings-note">Rollierender Schnitt über die letzten 10 Ergebnisse – anders als der Hit-Factor zwischen unterschiedlichen Übungen direkt vergleichbar.</p>
    <div class="score-chart-wrap">${globalAccuracyChartSvg(entries)}</div>` : ""}

    ${months.length ? `
    <div class="section-title">Trainingshäufigkeit</div>
    ${barListHtml(months.map(([key, count]) => ({ label: formatMonthKey(key), value: count })))}` : ""}

    ${top.length ? `
    <div class="section-title">Meistgeübte Übungen</div>
    ${barListHtml(top.map(x => ({ label: x.title, value: x.count, suffix: "×" })))}` : ""}

    ${cats.length ? `
    <div class="section-title">Kategorien im Training</div>
    ${barListHtml(cats.map(([cat, count]) => ({ label: cat, value: count })))}` : ""}

    ${!entries.length && !sessions.length ? `<p class="settings-note">Noch keine Trainingsdaten erfasst – trag Ergebnisse bei einer Übung ein oder leg im Tagebuch eine Einheit an, dann erscheinen hier Auswertungen.</p>` : ""}
  `;
  applyBarWidths(box);
}

function initMatches() {
  const overlayEl = document.getElementById("match-overlay");
  document.getElementById("matches-btn").addEventListener("click", openMatches);
  document.getElementById("match-close").addEventListener("click", closeMatches);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeMatches(); });
}

function openMatches() {
  renderMatchList();
  const overlayEl = document.getElementById("match-overlay");
  if (overlayEl.classList.contains("hidden")) {
    overlayEl.classList.remove("hidden");
    lockBodyScroll();
  }
}

function closeMatches() {
  const overlayEl = document.getElementById("match-overlay");
  if (!overlayEl || overlayEl.classList.contains("hidden")) return;
  overlayEl.classList.add("hidden");
  unlockBodyScroll();
}

function renderMatchList() {
  const box = document.getElementById("match-content");
  const sorted = matches.slice().sort((a, b) => b.date.localeCompare(a.date));
  box.innerHTML = `
    <h2>Matches</h2>
    <p class="settings-note">Trage deine Stage-Ergebnisse ein. Die App zeigt, wo Punkte verloren gehen, und schlägt passende Übungen vor.</p>
    <button type="button" class="save-btn" id="match-new-btn">+ Neues Match</button>
    <div class="journal-list">
      ${sorted.length ? sorted.map(m => {
        const a = analyzeMatch(m);
        return `<button type="button" class="journal-item" data-id="${escapeHtml(m.id)}">
          <span class="journal-date">${formatDateKey(m.date)}</span>
          <span class="journal-where"><strong>${escapeHtml(m.name)}</strong></span>
          <span class="journal-meta">${m.stages.length} Stage${m.stages.length === 1 ? "" : "s"}${a.percent !== null ? `, ${a.percent.toFixed(1)} %` : ""}</span>
        </button>`;
      }).join("") : `<p class="score-empty">Noch keine Matches eingetragen.</p>`}
    </div>`;
  document.getElementById("match-new-btn").addEventListener("click", () => renderMatchForm(null));
  box.querySelectorAll(".journal-item").forEach(btn => {
    btn.addEventListener("click", () => renderMatchAnalysis(matches.find(m => m.id === btn.dataset.id)));
  });
}

function stageFormHtml(stage, i) {
  const num = (key, label) => `<label class="score-field"><span>${label}</span><input type="number" min="0" step="1" inputmode="numeric" data-key="${key}" value="${stage[key] || ""}"></label>`;
  return `
    <div class="stage-card" data-index="${i}">
      <div class="stage-card-head">
        <input type="text" class="stage-name" data-key="name" maxlength="80" value="${escapeHtml(stage.name || `Stage ${i + 1}`)}" aria-label="Stage-Name">
        <button type="button" class="delete-btn stage-remove" data-index="${i}">Entfernen</button>
      </div>
      <div class="score-form">
        ${num("alpha", "A")}${num("charlie", "C")}${num("delta", "D")}${num("mike", "Miss")}${num("noshoot", "No-Shoot")}${num("procedural", "Proc.")}
        <label class="score-field"><span>Zeit (s)</span><input type="number" min="0" step="0.01" inputmode="decimal" data-key="time" value="${stage.time || ""}"></label>
        <label class="score-field"><span>Max. Punkte</span><input type="number" min="0" step="5" inputmode="numeric" data-key="maxPoints" value="${stage.maxPoints || ""}" placeholder="auto"></label>
        <label class="score-field"><span>HF Stagesieger</span><input type="number" min="0" step="0.0001" inputmode="decimal" data-key="winnerHF" value="${stage.winnerHF || ""}" placeholder="optional"></label>
        <label class="score-field stage-drill"><span>Skizze/Übung</span>
          <select data-key="drillId"><option value="">–</option>${DRILLS.map(d => `<option value="${escapeHtml(d.id)}"${d.id === stage.drillId ? " selected" : ""}>${escapeHtml(d.title)}</option>`).join("")}</select>
        </label>
      </div>
    </div>`;
}

function readStageCards() {
  return [...document.querySelectorAll("#match-content .stage-card")].map(card => {
    const raw = {};
    card.querySelectorAll("[data-key]").forEach(el => { raw[el.dataset.key] = el.value; });
    raw.id = card.dataset.stageId || null;
    return raw;
  });
}

function renderMatchForm(match, draft = null) {
  const box = document.getElementById("match-content");
  const m0 = draft || match || { name: "", date: localDateKey(new Date()), division: "", major: settings.powerFactor === "major", notes: "", stages: [] };
  const stages = m0.stages && m0.stages.length ? m0.stages : [{ name: "Stage 1" }];
  box.innerHTML = `
    <h2>${match ? "Match bearbeiten" : "Neues Match"}</h2>
    <div class="form-grid">
      <label class="form-field"><span>Name</span><input type="text" id="m-name" maxlength="120" value="${escapeHtml(m0.name)}" placeholder="z.B. Vienna Open"></label>
      <label class="form-field"><span>Datum</span><input type="date" id="m-date" value="${m0.date}"></label>
      <label class="form-field"><span>Division</span><input type="text" id="m-division" list="m-divisions" maxlength="40" value="${escapeHtml(m0.division)}">
        <datalist id="m-divisions">${DIVISIONS.map(d => `<option value="${d}">`).join("")}</datalist></label>
      <label class="form-field"><span>Power Factor</span><select id="m-pf"><option value="minor"${m0.major ? "" : " selected"}>Minor</option><option value="major"${m0.major ? " selected" : ""}>Major</option></select></label>
    </div>
    <div class="section-title">Stages</div>
    <p class="settings-note">„Max. Punkte“ leer lassen, dann rechnet die App mit 5 Punkten pro Treffer. Mit dem Hit-Factor des Stagesiegers (aus der Ergebnisliste) berechnet sie deinen Prozentwert.</p>
    <div id="m-stages">${stages.map((st, i) => stageFormHtml(st, i)).join("")}</div>
    <button type="button" class="tool-btn" id="m-add-stage">+ Stage hinzufügen</button>
    <label class="form-field form-field-wide"><span>Notizen</span><textarea id="m-notes" rows="3">${escapeHtml(m0.notes)}</textarea></label>
    <div class="form-actions">
      ${match ? `<button type="button" class="delete-btn" id="m-delete">Löschen</button>` : ""}
      <button type="button" class="tool-btn" id="m-cancel">Zurück</button>
      <button type="button" class="save-btn" id="m-save">Speichern &amp; auswerten</button>
    </div>`;
  box.querySelectorAll(".stage-card").forEach((card, i) => { if (stages[i] && stages[i].id) card.dataset.stageId = stages[i].id; });

  const collect = () => ({
    id: match ? match.id : null,
    name: document.getElementById("m-name").value,
    date: document.getElementById("m-date").value,
    division: document.getElementById("m-division").value,
    major: document.getElementById("m-pf").value === "major",
    notes: document.getElementById("m-notes").value,
    stages: readStageCards()
  });
  document.getElementById("m-add-stage").addEventListener("click", () => {
    const d = collect();
    d.stages.push({ name: `Stage ${d.stages.length + 1}` });
    renderMatchForm(match, d);
  });
  box.querySelectorAll(".stage-remove").forEach(btn => btn.addEventListener("click", () => {
    const d = collect();
    d.stages.splice(Number(btn.dataset.index), 1);
    renderMatchForm(match, d);
  }));
  document.getElementById("m-cancel").addEventListener("click", () => match ? renderMatchAnalysis(match) : renderMatchList());
  if (match) {
    document.getElementById("m-delete").addEventListener("click", () => {
      matches = matches.filter(x => x.id !== match.id);
      saveMatches();
      renderMatchList();
    });
  }
  document.getElementById("m-save").addEventListener("click", () => {
    const clean = sanitizeMatch(collect());
    if (!clean) { alert("Bitte Name und Datum des Matches angeben."); return; }
    clean.stages = clean.stages.filter(st => st.time > 0 || st.alpha + st.charlie + st.delta + st.mike > 0);
    const idx = matches.findIndex(x => x.id === clean.id);
    if (idx >= 0) matches[idx] = clean; else matches.push(clean);
    saveMatches();
    renderMatchAnalysis(clean);
  });
}

function renderMatchAnalysis(match) {
  const box = document.getElementById("match-content");
  const a = analyzeMatch(match);
  const pct = v => v === null ? "–" : `${v.toFixed(1)} %`;
  const maxLoss = Math.max(1, ...Object.values(a.lost));
  const advice = a.focus ? MATCH_ADVICE[a.focus] : null;
  const adviceDrills = advice ? advice.drills.map(id => DRILLS.find(d => d.id === id)).filter(Boolean) : [];
  box.innerHTML = `
    <h2>${escapeHtml(match.name)}</h2>
    <div class="drill-meta">
      <span class="badge">${formatDateKey(match.date)}</span>
      ${match.division ? `<span class="badge difficulty">${escapeHtml(match.division)}</span>` : ""}
      <span class="badge difficulty">${match.major ? "Major" : "Minor"}</span>
    </div>
    ${match.stages.length ? `
    <div class="detail-grid">
      <div class="stat-box"><div class="label">Punkte</div><div class="value">${a.points} von ${a.maxPoints}</div></div>
      <div class="stat-box"><div class="label">Trefferquote (Punkte)</div><div class="value">${a.accuracy === null ? "–" : pct(a.accuracy * 100)}</div></div>
      <div class="stat-box"><div class="label">Ø vom Stagesieger</div><div class="value">${pct(a.percent)}</div></div>
      <div class="stat-box"><div class="label">Punkte verloren</div><div class="value">${a.lostTotal}</div></div>
    </div>

    <div class="section-title">Wo die Punkte verloren gehen</div>
    <p class="settings-note">Abstand zu lauter A-Treffern ohne Strafen.</p>
    <div class="loss-bars">
      ${Object.entries(a.lost).map(([key, value]) => `
        <div class="loss-row" title="${LOSS_HINTS[key]}">
          <span class="loss-label">${LOSS_LABELS[key]}<small>${LOSS_HINTS[key]}</small></span>
          <span class="loss-bar"><span data-bar-width="${(value / maxLoss * 100).toFixed(1)}%"></span></span>
          <span class="loss-value">${value}</span>
        </div>`).join("")}
    </div>

    ${advice ? `
    <div class="section-title">Empfehlung</div>
    <p class="procedure-text">${escapeHtml(advice.text)}</p>
    <div class="advice-drills">${adviceDrills.map(d => `<button type="button" class="tool-btn advice-drill" data-id="${escapeHtml(d.id)}">${escapeHtml(d.title)}</button>`).join("")}</div>` : ""}

    <div class="section-title">Stages (schwächste zuerst)</div>
    <div class="score-table-wrap">
      <table class="score-table">
        <thead><tr><th>Stage</th><th>Punkte</th><th>Zeit</th><th>HF</th><th>% Sieger</th><th>Verlust</th></tr></thead>
        <tbody>${a.ranked.map(({ stage, result }) => `
          <tr>
            <td>${escapeHtml(stage.name || "Stage")}${stage.drillId ? ` <button type="button" class="link-btn stage-sketch" data-id="${escapeHtml(stage.drillId)}">Skizze</button>` : ""}</td>
            <td>${result.points}/${result.maxPoints}</td>
            <td>${stage.time.toFixed(2)}</td>
            <td>${result.hf.toFixed(4)}</td>
            <td>${pct(result.percent)}</td>
            <td>${result.lostTotal}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
    <p class="settings-note">Die Empfehlung ist eine Faustregel aus deinen Zahlen: Wer über 90 % der möglichen Punkte holt und trotzdem deutlich hinter dem Sieger liegt, verliert vor allem Zeit.</p>` : `<p class="score-empty">Noch keine Stages eingetragen.</p>`}
    ${match.notes ? `<div class="section-title">Notizen</div><div class="procedure-text">${escapeHtml(match.notes)}</div>` : ""}
    <div class="form-actions">
      <button type="button" class="tool-btn" id="m-back">Zur Liste</button>
      <button type="button" class="edit-btn" id="m-edit">Bearbeiten</button>
    </div>`;
  applyBarWidths(box);
  document.getElementById("m-back").addEventListener("click", renderMatchList);
  document.getElementById("m-edit").addEventListener("click", () => renderMatchForm(match));
  box.querySelectorAll(".advice-drill, .stage-sketch").forEach(btn => btn.addEventListener("click", () => {
    const drill = DRILLS.find(d => d.id === btn.dataset.id);
    if (!drill) return;
    closeMatches();
    openDetail(drill);
  }));
}

// ---------- Trainingspläne ----------

const BUILTIN_PLANS = [
  {
    id: "plan-dry-basics",
    builtin: true,
    title: "Trockentraining Grundlagen – 2 Wochen",
    description: "Zehn kurze Einheiten mit je 10 bis 15 Minuten, fünf pro Woche. Alle Übungen trocken mit leeren Magazinen – keine Munition im Raum. In Woche 2 die Par-Zeit jeweils um 0,2 s senken.",
    days: [
      { title: "Woche 1 – Tag 1", type: "dry", items: [{ drillId: "std-draw-first-shot", reps: "10× trocken" }, { drillId: "std-dryfire-reload", reps: "10×" }] },
      { title: "Woche 1 – Tag 2", type: "dry", items: [{ drillId: "std-draw-surrender", reps: "10× trocken" }, { drillId: "std-wide-transitions", reps: "10× trocken" }] },
      { title: "Woche 1 – Tag 3", type: "dry", items: [{ drillId: "std-dryfire-reload", reps: "15×" }, { drillId: "std-shot-reload-shot", reps: "10× trocken" }] },
      { title: "Woche 1 – Tag 4", type: "dry", items: [{ drillId: "std-el-presidente", reps: "5× trocken" }, { drillId: "std-strong-hand", reps: "10× trocken" }] },
      { title: "Woche 1 – Tag 5", type: "dry", items: [{ drillId: "std-box-to-box", reps: "5× trocken, Laufwege" }, { drillId: "std-draw-first-shot", reps: "10× trocken" }] },
      { title: "Woche 2 – Tag 1", type: "dry", items: [{ drillId: "std-draw-first-shot", reps: "10×, Par −0,2 s" }, { drillId: "std-dryfire-reload", reps: "10×, Par −0,2 s" }] },
      { title: "Woche 2 – Tag 2", type: "dry", items: [{ drillId: "std-draw-surrender", reps: "10×, Par −0,2 s" }, { drillId: "std-wide-transitions", reps: "10×, Par −0,2 s" }] },
      { title: "Woche 2 – Tag 3", type: "dry", items: [{ drillId: "std-shot-reload-shot", reps: "10×, Par −0,2 s" }, { drillId: "std-weak-hand", reps: "10× trocken" }] },
      { title: "Woche 2 – Tag 4", type: "dry", items: [{ drillId: "std-el-presidente", reps: "5×, Par −0,5 s" }, { drillId: "std-partial-targets", reps: "10× trocken" }] },
      { title: "Woche 2 – Tag 5", type: "dry", items: [{ drillId: "std-box-to-box", reps: "5×, Par −0,5 s" }, { drillId: "std-barricade", reps: "5× trocken" }] }
    ]
  },
  {
    id: "plan-match-week",
    builtin: true,
    title: "Match-Vorbereitung – 1 Woche",
    description: "Drei Einheiten in der Woche vor einem Match: erst Abläufe trocken festigen, dann scharf bestätigen, zum Schluss locker und kurz.",
    days: [
      { title: "Tag 1 – Abläufe trocken", type: "dry", items: [{ drillId: "std-el-presidente", reps: "5× trocken" }, { drillId: "std-box-to-box", reps: "5× trocken" }, { drillId: "std-table-start", reps: "5× trocken" }] },
      { title: "Tag 2 – scharf bestätigen", type: "live", items: [{ drillId: "std-bill-drill", reps: "5 Durchgänge" }, { drillId: "std-partial-targets", reps: "5 Durchgänge" }, { drillId: "std-plates", reps: "5 Durchgänge" }] },
      { title: "Tag 3 – locker", type: "dry", items: [{ drillId: "std-draw-first-shot", reps: "10× trocken" }, { drillId: "std-dryfire-reload", reps: "10×" }] }
    ]
  },
  {
    id: "plan-live-basics",
    builtin: true,
    title: "Scharfschießen Grundlagen – 4 Einheiten",
    description: "Vier Einheiten mit jeweils rund 100 Schuss. Ergebnisse eintragen und die Entwicklung in der Auswertung verfolgen.",
    days: [
      { title: "Einheit 1 – Treffer und Rückstoß", type: "live", items: [{ drillId: "std-doubles", reps: "10 Durchgänge" }, { drillId: "std-precision-distance", reps: "5 Durchgänge" }, { drillId: "std-bill-drill", reps: "5 Durchgänge" }] },
      { title: "Einheit 2 – Wechsel", type: "live", items: [{ drillId: "std-shot-reload-shot", reps: "10 Durchgänge" }, { drillId: "std-wide-transitions", reps: "10 Durchgänge" }, { drillId: "std-distance-changes", reps: "5 Durchgänge" }] },
      { title: "Einheit 3 – Stahl und No-Shoots", type: "live", items: [{ drillId: "std-plates", reps: "5 Durchgänge" }, { drillId: "std-popper-paper", reps: "5 Durchgänge" }, { drillId: "std-partial-targets", reps: "5 Durchgänge" }] },
      { title: "Einheit 4 – Stage-Elemente", type: "live", items: [{ drillId: "std-el-presidente", reps: "5 Durchgänge" }, { drillId: "std-box-to-box", reps: "5 Durchgänge" }, { drillId: "std-strong-hand", reps: "3 Durchgänge" }, { drillId: "std-weak-hand", reps: "3 Durchgänge" }] }
    ]
  }
];

function sanitizePlan(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = cleanStr(raw.title, 120).trim();
  if (!title) return null;
  const days = cleanArr(raw.days, 100).map(day => day && typeof day === "object" ? {
    title: cleanStr(day.title, 80).trim() || "Tag",
    type: day.type === "live" ? "live" : "dry",
    items: cleanArr(day.items, 30).map(it => it && cleanId(it.drillId) ? { drillId: it.drillId, reps: cleanStr(it.reps, 60).trim() } : null).filter(Boolean)
  } : null).filter(Boolean);
  if (!days.length) return null;
  return { id: cleanId(raw.id) || newCustomId().replace("custom", "plan"), title, description: cleanStr(raw.description, 2000), days };
}

function sanitizePlans(list) { return cleanArr(list, 200).map(sanitizePlan).filter(Boolean); }

function sanitizePlanProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [planId, prog] of Object.entries(raw)) {
    if (!cleanId(planId) || !prog || typeof prog !== "object") continue;
    const done = {};
    for (const [day, date] of Object.entries(prog.done || {})) {
      const i = cleanInt(day, -1, 0, 99);
      if (i >= 0 && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) done[i] = date;
    }
    out[planId] = { done };
  }
  return out;
}

function saveCustomPlans() { saveJSON(PLANS_KEY, customPlans); }
function savePlanProgress() { saveJSON(PLAN_PROGRESS_KEY, planProgress); }
function allPlans() { return [...BUILTIN_PLANS, ...customPlans]; }

function planDoneCount(plan) {
  const done = (planProgress[plan.id] || {}).done || {};
  return plan.days.filter((_, i) => done[i]).length;
}

function initPlans() {
  const overlayEl = document.getElementById("plans-overlay");
  document.getElementById("plans-btn").addEventListener("click", openPlans);
  document.getElementById("plans-close").addEventListener("click", closePlans);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closePlans(); });
}

function openPlans() {
  renderPlanList();
  const overlayEl = document.getElementById("plans-overlay");
  if (overlayEl.classList.contains("hidden")) {
    overlayEl.classList.remove("hidden");
    lockBodyScroll();
  }
}

function closePlans() {
  const overlayEl = document.getElementById("plans-overlay");
  if (!overlayEl || overlayEl.classList.contains("hidden")) return;
  overlayEl.classList.add("hidden");
  unlockBodyScroll();
}

function renderPlanList() {
  const box = document.getElementById("plans-content");
  const item = plan => {
    const done = planDoneCount(plan);
    return `<button type="button" class="journal-item plan-item" data-id="${escapeHtml(plan.id)}">
      <span class="journal-where"><strong>${escapeHtml(plan.title)}</strong></span>
      ${plan.builtin ? `<span class="badge difficulty">Vorlage</span>` : `<span class="badge custom">Eigener Plan</span>`}
      <span class="journal-meta">${done} von ${plan.days.length} erledigt</span>
      <span class="plan-progress"><span data-bar-width="${(done / plan.days.length * 100).toFixed(0)}%"></span></span>
    </button>`;
  };
  box.innerHTML = `
    <h2>Trainingspläne</h2>
    <button type="button" class="save-btn" id="plan-new-btn">+ Eigener Plan</button>
    <div class="journal-list">${allPlans().map(item).join("")}</div>`;
  applyBarWidths(box);
  document.getElementById("plan-new-btn").addEventListener("click", () => renderPlanForm(null));
  box.querySelectorAll(".plan-item").forEach(btn => btn.addEventListener("click", () => renderPlanView(allPlans().find(pl => pl.id === btn.dataset.id))));
}

function renderPlanView(plan, message = "") {
  const box = document.getElementById("plans-content");
  const done = (planProgress[plan.id] || {}).done || {};
  box.innerHTML = `
    <h2>${escapeHtml(plan.title)}</h2>
    ${plan.description ? `<p class="procedure-text">${escapeHtml(plan.description)}</p>` : ""}
    <p class="plan-status">${planDoneCount(plan)} von ${plan.days.length} erledigt</p>
    ${message ? `<p class="plan-message">${message}</p>` : ""}
    <div class="plan-days">
      ${plan.days.map((day, i) => `
        <div class="plan-day${done[i] ? " done" : ""}">
          <div class="plan-day-head">
            <strong>${escapeHtml(day.title)}</strong>
            <span class="badge difficulty">${day.type === "live" ? "Scharf" : "Trocken"}</span>
            ${done[i] ? `<span class="plan-done-date">✓ ${formatDateKey(done[i])}</span>` : ""}
          </div>
          <ul class="plan-day-items">
            ${day.items.map(it => {
              const drill = DRILLS.find(d => d.id === it.drillId);
              return `<li>${drill ? `<button type="button" class="link-btn plan-drill" data-id="${escapeHtml(drill.id)}">${escapeHtml(drill.title)}</button>` : "(Übung nicht mehr vorhanden)"}${it.reps ? ` <span class="plan-reps">${escapeHtml(it.reps)}</span>` : ""}</li>`;
            }).join("")}
          </ul>
          <button type="button" class="tool-btn plan-toggle" data-day="${i}">${done[i] ? "Als offen markieren" : "Erledigt"}</button>
        </div>`).join("")}
    </div>
    <div class="form-actions">
      ${plan.builtin ? "" : `<button type="button" class="delete-btn" id="plan-delete">Löschen</button><button type="button" class="edit-btn" id="plan-edit">Bearbeiten</button>`}
      ${planDoneCount(plan) ? `<button type="button" class="tool-btn" id="plan-reset">Fortschritt zurücksetzen</button>` : ""}
      <button type="button" class="tool-btn" id="plan-back">Zur Liste</button>
    </div>`;

  document.getElementById("plan-back").addEventListener("click", renderPlanList);
  const resetBtn = document.getElementById("plan-reset");
  if (resetBtn) resetBtn.addEventListener("click", () => { delete planProgress[plan.id]; savePlanProgress(); renderPlanView(plan); });
  if (!plan.builtin) {
    document.getElementById("plan-edit").addEventListener("click", () => renderPlanForm(plan));
    document.getElementById("plan-delete").addEventListener("click", () => {
      customPlans = customPlans.filter(pl => pl.id !== plan.id);
      delete planProgress[plan.id];
      saveCustomPlans();
      savePlanProgress();
      renderPlanList();
    });
  }
  box.querySelectorAll(".plan-drill").forEach(btn => btn.addEventListener("click", () => {
    const drill = DRILLS.find(d => d.id === btn.dataset.id);
    closePlans();
    if (drill) openDetail(drill);
  }));
  box.querySelectorAll(".plan-toggle").forEach(btn => btn.addEventListener("click", () => {
    const i = Number(btn.dataset.day);
    const prog = planProgress[plan.id] || (planProgress[plan.id] = { done: {} });
    if (prog.done[i]) {
      delete prog.done[i];
      savePlanProgress();
      renderPlanView(plan);
      return;
    }
    const today = localDateKey(new Date());
    prog.done[i] = today;
    savePlanProgress();
    const day = plan.days[i];
    renderPlanView(plan, `„${escapeHtml(day.title)}“ erledigt. <button type="button" class="tool-btn" id="plan-to-journal" data-day="${i}">Im Trainingstagebuch eintragen</button>`);
    document.getElementById("plan-to-journal").addEventListener("click", () => {
      sessions.push(sanitizeSession({
        date: today,
        type: day.type,
        drillIds: day.items.map(it => it.drillId).filter(id => DRILLS.some(d => d.id === id)),
        notes: `${plan.title}: ${day.title}`
      }));
      saveSessions();
      renderPlanView(plan, "Im Trainingstagebuch eingetragen. Munition und Notizen kannst du dort ergänzen.");
    });
  }));
}

function renderPlanForm(plan, draft = null) {
  const box = document.getElementById("plans-content");
  const p0 = draft || plan || { title: "", description: "", days: [{ title: "Tag 1", type: "dry", items: [] }] };
  const drillOptions = DRILLS.map(d => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title)}</option>`).join("");
  box.innerHTML = `
    <h2>${plan ? "Plan bearbeiten" : "Eigener Trainingsplan"}</h2>
    <div class="form-grid">
      <label class="form-field form-field-wide"><span>Name</span><input type="text" id="pl-title" maxlength="120" value="${escapeHtml(p0.title)}"></label>
      <label class="form-field form-field-wide"><span>Beschreibung</span><textarea id="pl-desc" rows="2">${escapeHtml(p0.description || "")}</textarea></label>
    </div>
    <div id="pl-days">
      ${p0.days.map((day, i) => `
        <div class="plan-day stage-card" data-day="${i}">
          <div class="stage-card-head">
            <input type="text" class="stage-name pl-day-title" maxlength="80" value="${escapeHtml(day.title)}" aria-label="Name des Tages">
            <select class="pl-day-type"><option value="dry"${day.type === "dry" ? " selected" : ""}>Trocken</option><option value="live"${day.type === "live" ? " selected" : ""}>Scharf</option></select>
            <button type="button" class="delete-btn pl-day-remove" data-day="${i}">Entfernen</button>
          </div>
          <ul class="plan-day-items">
            ${day.items.map((it, j) => {
              const drill = DRILLS.find(d => d.id === it.drillId);
              return `<li data-drill="${escapeHtml(it.drillId)}" data-reps="${escapeHtml(it.reps || "")}">${escapeHtml(drill ? drill.title : it.drillId)}${it.reps ? ` <span class="plan-reps">${escapeHtml(it.reps)}</span>` : ""} <button type="button" class="link-btn pl-item-remove" data-day="${i}" data-item="${j}">entfernen</button></li>`;
            }).join("")}
          </ul>
          <div class="score-form">
            <label class="score-field stage-drill"><span>Übung</span><select class="pl-add-drill">${drillOptions}</select></label>
            <label class="score-field"><span>Umfang</span><input type="text" class="pl-add-reps" maxlength="60" placeholder="z.B. 10×"></label>
            <button type="button" class="tool-btn pl-add-item" data-day="${i}">Hinzufügen</button>
          </div>
        </div>`).join("")}
    </div>
    <button type="button" class="tool-btn" id="pl-add-day">+ Tag hinzufügen</button>
    <div class="form-actions">
      <button type="button" class="tool-btn" id="pl-cancel">Zurück</button>
      <button type="button" class="save-btn" id="pl-save">Speichern</button>
    </div>`;

  const collect = () => ({
    id: plan ? plan.id : (draft && draft.id) || null,
    title: document.getElementById("pl-title").value,
    description: document.getElementById("pl-desc").value,
    days: [...box.querySelectorAll("#pl-days > .plan-day")].map(dayEl => ({
      title: dayEl.querySelector(".pl-day-title").value,
      type: dayEl.querySelector(".pl-day-type").value,
      items: [...dayEl.querySelectorAll(".plan-day-items li")].map(li => ({ drillId: li.dataset.drill, reps: li.dataset.reps }))
    }))
  });

  document.getElementById("pl-add-day").addEventListener("click", () => {
    const d = collect();
    d.days.push({ title: `Tag ${d.days.length + 1}`, type: "dry", items: [] });
    renderPlanForm(plan, d);
  });
  box.querySelectorAll(".pl-day-remove").forEach(btn => btn.addEventListener("click", () => {
    const d = collect();
    d.days.splice(Number(btn.dataset.day), 1);
    if (!d.days.length) d.days.push({ title: "Tag 1", type: "dry", items: [] });
    renderPlanForm(plan, d);
  }));
  box.querySelectorAll(".pl-add-item").forEach(btn => btn.addEventListener("click", () => {
    const d = collect();
    const dayEl = btn.closest(".plan-day");
    d.days[Number(btn.dataset.day)].items.push({ drillId: dayEl.querySelector(".pl-add-drill").value, reps: dayEl.querySelector(".pl-add-reps").value.trim() });
    renderPlanForm(plan, d);
  }));
  box.querySelectorAll(".pl-item-remove").forEach(btn => btn.addEventListener("click", () => {
    const d = collect();
    d.days[Number(btn.dataset.day)].items.splice(Number(btn.dataset.item), 1);
    renderPlanForm(plan, d);
  }));
  document.getElementById("pl-cancel").addEventListener("click", () => plan ? renderPlanView(plan) : renderPlanList());
  document.getElementById("pl-save").addEventListener("click", () => {
    const d = collect();
    d.days = d.days.filter(day => day.items.length);
    const clean = sanitizePlan(d);
    if (!clean) { alert("Bitte einen Namen und mindestens einen Tag mit einer Übung angeben."); return; }
    const idx = customPlans.findIndex(pl => pl.id === clean.id);
    if (idx >= 0) customPlans[idx] = clean; else customPlans.push(clean);
    saveCustomPlans();
    renderPlanView(clean);
  });
}

// ---------- CSV-Export der Ergebnisse ----------

function csvCell(value) {
  let text = String(value === null || value === undefined ? "" : value);
  // Schutz vor Formeln, die Excel beim Öffnen ausführen würde
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildScoresCsv() {
  const num = (v, digits) => v.toFixed(digits).replace(".", ",");
  const header = ["Datum", "Uhrzeit", "Training", "Kategorie", "A", "C", "D", "Miss", "No-Shoot", "Procedural", "Zeit (s)", "Power Factor", "Punkte", "Hit-Factor"];
  const rows = [];
  for (const [drillId, entries] of Object.entries(scoreLogs)) {
    const drill = DRILLS.find(d => d.id === drillId);
    for (const e of entries) {
      const d = new Date(e.date);
      rows.push({ sort: e.date, cells: [
        d.toLocaleDateString("de-AT"), d.toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" }),
        drill ? drill.title : "(gelöschtes Training)", drill ? drill.category : "",
        e.alpha, e.charlie, e.delta, e.mike, e.noshoot, e.procedural,
        num(e.time, 2), e.major ? "Major" : "Minor", e.points, num(e.hitFactor, 4)
      ] });
    }
  }
  rows.sort((a, b) => a.sort.localeCompare(b.sort));
  // Semikolon und Komma als Dezimalzeichen, damit Excel mit deutschen Einstellungen die Datei direkt richtig öffnet
  return "\uFEFF" + [header, ...rows.map(r => r.cells)].map(r => r.map(csvCell).join(";")).join("\r\n");
}

function exportScoresCsv() {
  const count = Object.values(scoreLogs).reduce((n, list) => n + list.length, 0);
  if (!count) { showDbMsg("Noch keine Ergebnisse vorhanden."); return; }
  downloadBlob(new Blob([buildScoresCsv()], { type: "text/csv;charset=utf-8" }), "ipsc-ergebnisse.csv");
  showDbMsg(`${count} Ergebnisse als CSV exportiert.`);
}

// ---------- Trainingstagebuch (Einheiten, Munition) ----------

function localDateKey(dateOrIso) {
  const d = dateOrIso instanceof Date ? dateOrIso : new Date(dateOrIso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateKey(key) {
  const [y, m, d] = key.split("-");
  return `${d}.${m}.${y}`;
}

function sanitizeSession(raw) {
  if (!raw || typeof raw !== "object") return null;
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  if (!date) return null;
  return {
    id: cleanId(raw.id) || newCustomId().replace("custom", "session"),
    date,
    type: raw.type === "dry" ? "dry" : "live",
    location: cleanStr(raw.location, 100).trim(),
    rounds: cleanInt(raw.rounds, 0, 0, 100000),
    minutes: cleanInt(raw.minutes, 0, 0, 1440),
    drillIds: [...new Set(cleanArr(raw.drillIds, 200).filter(id => cleanId(id)))],
    notes: cleanStr(raw.notes, 5000)
  };
}

function sanitizeSessions(list) {
  return cleanArr(list, 5000).map(sanitizeSession).filter(Boolean);
}

function saveSessions() { saveJSON(SESSIONS_KEY, sessions); }

function sessionSummary(now = new Date()) {
  const month = localDateKey(now).slice(0, 7), year = month.slice(0, 4);
  const inMonth = sessions.filter(x => x.date.startsWith(month));
  const inYear = sessions.filter(x => x.date.startsWith(year));
  return {
    roundsMonth: inMonth.reduce((n, x) => n + x.rounds, 0),
    roundsYear: inYear.reduce((n, x) => n + x.rounds, 0),
    liveMonth: inMonth.filter(x => x.type === "live").length,
    dryMonth: inMonth.filter(x => x.type === "dry").length
  };
}

function scoresOnDate(dateKey) {
  const list = [];
  for (const [drillId, entries] of Object.entries(scoreLogs)) {
    for (const e of entries) if (localDateKey(e.date) === dateKey) list.push({ drillId, entry: e });
  }
  return list;
}

function initJournal() {
  const overlayEl = document.getElementById("journal-overlay");
  document.getElementById("journal-btn").addEventListener("click", openJournal);
  document.getElementById("journal-close").addEventListener("click", closeJournal);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeJournal(); });
}

function openJournal() {
  renderJournalList();
  const overlayEl = document.getElementById("journal-overlay");
  if (overlayEl.classList.contains("hidden")) {
    overlayEl.classList.remove("hidden");
    lockBodyScroll();
  }
}

function closeJournal() {
  const overlayEl = document.getElementById("journal-overlay");
  if (!overlayEl || overlayEl.classList.contains("hidden")) return;
  overlayEl.classList.add("hidden");
  unlockBodyScroll();
}

function renderJournalList() {
  const box = document.getElementById("journal-content");
  const sum = sessionSummary();
  const sorted = sessions.slice().sort((a, b) => b.date.localeCompare(a.date));
  box.innerHTML = `
    <h2>Trainingstagebuch</h2>
    <div class="detail-grid journal-summary">
      <div class="stat-box"><div class="label">Munition diesen Monat</div><div class="value">${sum.roundsMonth}</div></div>
      <div class="stat-box"><div class="label">Munition dieses Jahr</div><div class="value">${sum.roundsYear}</div></div>
      <div class="stat-box"><div class="label">Einheiten diesen Monat</div><div class="value">${sum.liveMonth} scharf, ${sum.dryMonth} trocken</div></div>
    </div>
    <button type="button" class="save-btn" id="journal-new-btn">+ Neue Einheit</button>
    <div class="journal-list">
      ${sorted.length ? sorted.map(x => `
        <button type="button" class="journal-item" data-id="${escapeHtml(x.id)}">
          <span class="journal-date">${formatDateKey(x.date)}</span>
          <span class="badge ${x.type === "dry" ? "difficulty" : ""}">${x.type === "dry" ? "Trocken" : "Scharf"}</span>
          <span class="journal-where">${escapeHtml(x.location || "")}</span>
          <span class="journal-meta">${x.type === "live" ? `${x.rounds} Schuss` : ""}${x.drillIds.length ? ` ${x.drillIds.length} Übung${x.drillIds.length > 1 ? "en" : ""}` : ""}</span>
        </button>`).join("") : `<p class="score-empty">Noch keine Einheiten eingetragen.</p>`}
    </div>`;
  document.getElementById("journal-new-btn").addEventListener("click", () => renderJournalForm(null));
  box.querySelectorAll(".journal-item").forEach(btn => {
    btn.addEventListener("click", () => renderJournalForm(sessions.find(x => x.id === btn.dataset.id)));
  });
}

function renderJournalForm(session) {
  const box = document.getElementById("journal-content");
  const s0 = session || { date: localDateKey(new Date()), type: "live", location: "", rounds: 0, minutes: 0, drillIds: [], notes: "" };
  const selected = new Set(s0.drillIds);
  box.innerHTML = `
    <h2>${session ? "Einheit bearbeiten" : "Neue Trainingseinheit"}</h2>
    <div class="form-grid">
      <label class="form-field"><span>Datum</span><input type="date" id="j-date" value="${s0.date}"></label>
      <label class="form-field"><span>Art</span>
        <select id="j-type"><option value="live"${s0.type === "live" ? " selected" : ""}>Scharfschießen</option><option value="dry"${s0.type === "dry" ? " selected" : ""}>Trockentraining</option></select>
      </label>
      <label class="form-field"><span>Ort</span><input type="text" id="j-location" maxlength="100" value="${escapeHtml(s0.location)}" placeholder="z.B. Vereinsstand"></label>
      <label class="form-field"><span>Dauer (Minuten)</span><input type="number" id="j-minutes" min="0" max="1440" step="5" inputmode="numeric" value="${s0.minutes || ""}"></label>
      <label class="form-field j-rounds-field"><span>Verschossene Patronen</span><input type="number" id="j-rounds" min="0" step="1" inputmode="numeric" value="${s0.rounds || ""}"></label>
      <div class="form-field"><span>Vorschlag</span><div id="j-suggestion" class="journal-suggestion"></div></div>
    </div>
    <div class="section-title">Übungen</div>
    <input type="search" id="j-drill-search" class="journal-search" placeholder="Übung suchen …" autocomplete="off">
    <div class="journal-drills" id="j-drills">
      ${DRILLS.map(d => `<label class="journal-drill" data-search="${escapeHtml(drillSearchText(d))}"><input type="checkbox" value="${escapeHtml(d.id)}"${selected.has(d.id) ? " checked" : ""}> ${escapeHtml(d.title)}</label>`).join("")}
    </div>
    <label class="form-field form-field-wide"><span>Notizen</span><textarea id="j-notes" rows="3">${escapeHtml(s0.notes)}</textarea></label>
    <div id="j-results"></div>
    <div class="form-actions">
      ${session ? `<button type="button" class="delete-btn" id="j-delete">Löschen</button>` : ""}
      <button type="button" class="tool-btn" id="j-cancel">Zurück</button>
      <button type="button" class="save-btn" id="j-save">Speichern</button>
    </div>`;

  const dateInput = document.getElementById("j-date");
  const typeSelect = document.getElementById("j-type");
  const updateDayInfo = () => {
    const dayScores = scoresOnDate(dateInput.value);
    const shots = dayScores.reduce((n, x) => n + x.entry.alpha + x.entry.charlie + x.entry.delta + x.entry.mike, 0);
    const sugg = document.getElementById("j-suggestion");
    document.querySelector(".j-rounds-field").classList.toggle("hidden", typeSelect.value === "dry");
    if (typeSelect.value === "live" && shots) {
      sugg.innerHTML = `${shots} Schuss aus Ergebnissen <button type="button" class="tool-btn" id="j-take">übernehmen</button>`;
      document.getElementById("j-take").addEventListener("click", () => { document.getElementById("j-rounds").value = shots; });
    } else {
      sugg.textContent = typeSelect.value === "dry" ? "Trockentraining ohne Munition" : "Keine Ergebnisse an diesem Tag";
    }
    const results = document.getElementById("j-results");
    results.innerHTML = dayScores.length ? `
      <div class="section-title">Ergebnisse an diesem Tag</div>
      <ul class="journal-results">${dayScores.map(x => {
        const drill = DRILLS.find(d => d.id === x.drillId);
        return `<li>${escapeHtml(drill ? drill.title : "(gelöschtes Training)")}: Hit-Factor <strong>${x.entry.hitFactor.toFixed(2)}</strong></li>`;
      }).join("")}</ul>` : "";
  };
  dateInput.addEventListener("change", updateDayInfo);
  typeSelect.addEventListener("change", updateDayInfo);
  updateDayInfo();

  const search = document.getElementById("j-drill-search");
  search.addEventListener("input", () => {
    const terms = normalizeSearch(search.value).split(/\s+/).filter(Boolean);
    box.querySelectorAll(".journal-drill").forEach(label => {
      label.classList.toggle("hidden", !terms.every(t => label.dataset.search.includes(t)));
    });
  });

  document.getElementById("j-cancel").addEventListener("click", renderJournalList);
  if (session) {
    document.getElementById("j-delete").addEventListener("click", () => {
      sessions = sessions.filter(x => x.id !== session.id);
      saveSessions();
      renderJournalList();
    });
  }
  document.getElementById("j-save").addEventListener("click", () => {
    const clean = sanitizeSession({
      id: session ? session.id : null,
      date: dateInput.value,
      type: typeSelect.value,
      location: document.getElementById("j-location").value,
      rounds: typeSelect.value === "dry" ? 0 : document.getElementById("j-rounds").value,
      minutes: document.getElementById("j-minutes").value,
      drillIds: [...box.querySelectorAll(".journal-drill input:checked")].map(cb => cb.value),
      notes: document.getElementById("j-notes").value
    });
    if (!clean) { alert("Bitte ein gültiges Datum angeben."); return; }
    const idx = sessions.findIndex(x => x.id === clean.id);
    if (idx >= 0) sessions[idx] = clean; else sessions.push(clean);
    saveSessions();
    renderJournalList();
  });
}

// ---------- Ziele zum Ausdrucken fürs Trockentraining ----------
// Ein verkleinertes Ziel auf kurze Distanz erscheint unter demselben Winkel
// wie das Originalziel auf der simulierten Distanz: Maßstab = Übungsdistanz / simulierte Distanz.

function printTargetLayout(practiceM, simulatedM, count) {
  const scale = practiceM / simulatedM;
  const w = PRINT_TARGET_W_CM * scale * 10, h = PRINT_TARGET_H_CM * scale * 10; // mm
  const gap = 10, header = 32, margin = 10;
  const needW = count * w + (count - 1) * gap;
  const fits = (pageW, pageH) => needW <= pageW - 2 * margin && h <= pageH - 2 * margin - header;
  const orientation = fits(210, 297) ? "portrait" : fits(297, 210) ? "landscape" : null;
  return { scale, w, h, orientation };
}

function printTargetSvg(wMm, hMm, inkSaving) {
  const hw = PRINT_TARGET_W_CM / 2, hh = PRINT_TARGET_H_CM / 2;
  const fill = inkSaving ? "#ffffff" : TARGET_TAN;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${wMm.toFixed(1)}mm" height="${hMm.toFixed(1)}mm" viewBox="${-hw} ${-hh} ${PRINT_TARGET_W_CM} ${PRINT_TARGET_H_CM}">
    <polygon points="${shapePoints(TARGET_OUTLINE, 0, 0, hw, hh)}" fill="${fill}" stroke="#000" stroke-width="2" vector-effect="non-scaling-stroke"/>
    <polygon points="${shapePoints(TARGET_C_ZONE, 0, 0, hw, hh)}" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <polygon points="${shapePoints(TARGET_A_ZONE, 0, 0, hw, hh)}" fill="none" stroke="#000" stroke-width="1" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function initPrintTargets() {
  const overlayEl = document.getElementById("print-overlay");
  document.getElementById("print-targets-btn").addEventListener("click", openPrintTargets);
  document.getElementById("print-close").addEventListener("click", closePrintTargets);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closePrintTargets(); });
  ["p-practice", "p-simulated", "p-count"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", updatePrintInfo);
    el.addEventListener("change", updatePrintInfo);
  });
  document.getElementById("p-print").addEventListener("click", printTargets);
  window.addEventListener("afterprint", () => {
    const sheet = document.getElementById("print-sheet");
    if (sheet) sheet.remove();
  });
}

function openPrintTargets() {
  updatePrintInfo();
  document.getElementById("print-overlay").classList.remove("hidden");
  lockBodyScroll();
}

function closePrintTargets() {
  const overlayEl = document.getElementById("print-overlay");
  if (!overlayEl || overlayEl.classList.contains("hidden")) return;
  overlayEl.classList.add("hidden");
  unlockBodyScroll();
}

function readPrintForm() {
  return {
    practice: cleanNum(document.getElementById("p-practice").value, 0, 0, 100),
    simulated: cleanNum(document.getElementById("p-simulated").value, 0, 0, 100),
    count: cleanInt(document.getElementById("p-count").value, 1, 1, 3),
    inkSaving: document.getElementById("p-ink").checked
  };
}

function updatePrintInfo() {
  const f = readPrintForm();
  const info = document.getElementById("p-info");
  const btn = document.getElementById("p-print");
  if (!(f.practice > 0) || !(f.simulated > 0)) {
    info.textContent = "Bitte beide Distanzen angeben.";
    btn.disabled = true;
    return null;
  }
  if (f.practice >= f.simulated) {
    info.textContent = "Die simulierte Distanz muss größer als die Übungsdistanz sein.";
    btn.disabled = true;
    return null;
  }
  const layout = printTargetLayout(f.practice, f.simulated, f.count);
  const size = `${(layout.w / 10).toFixed(1).replace(".", ",")} × ${(layout.h / 10).toFixed(1).replace(".", ",")} cm`;
  if (!layout.orientation) {
    info.textContent = `Ein Ziel wäre ${size} groß und passt so nicht auf A4. Weniger Ziele pro Seite wählen oder die Übungsdistanz verkürzen.`;
    btn.disabled = true;
    return null;
  }
  info.textContent = `Zielgröße ${size} (Maßstab 1 : ${(1 / layout.scale).toFixed(2).replace(".", ",")}), A4 ${layout.orientation === "portrait" ? "hochkant" : "quer"}.`;
  btn.disabled = false;
  return { ...f, layout };
}

function buildPrintSheet(config) {
  const { practice, simulated, count, inkSaving, layout } = config;
  const fmt = v => String(v).replace(".", ",");
  const targets = Array.from({ length: count }, () => printTargetSvg(layout.w, layout.h, inkSaving)).join("");
  return `
    <div class="print-header">
      <strong>IPSC-Ziel fürs Trockentraining: aus ${fmt(practice)} m wirkt es wie auf ${fmt(simulated)} m</strong>
      <div>Nur ohne Munition im Raum trainieren. Beim Drucken „Tatsächliche Größe“ bzw. Skalierung 100 % wählen.</div>
      <div class="print-ruler"><span class="print-ruler-line"></span> Kontrolle: Diese Linie muss genau 10 cm lang sein.</div>
    </div>
    <div class="print-targets">${targets}</div>
    <div class="print-footer">Maße nach IPSC-Zielscheibe 45 × 57 cm, Trefferzonen angenähert. IPSC Trainings-Bibliothek</div>`;
}

function printTargets() {
  const config = updatePrintInfo();
  if (!config) return;
  let sheet = document.getElementById("print-sheet");
  if (!sheet) {
    sheet = document.createElement("div");
    sheet.id = "print-sheet";
    document.body.appendChild(sheet);
  }
  sheet.innerHTML = buildPrintSheet(config);
  let pageStyle = document.getElementById("print-page-style");
  if (!pageStyle) {
    pageStyle = document.createElement("style");
    pageStyle.id = "print-page-style";
    document.head.appendChild(pageStyle);
  }
  pageStyle.textContent = `@page { size: A4 ${config.layout.orientation}; margin: 10mm; }`;
  window.print();
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
  return typeof v === "string" && v.length > 0 && v.length <= 200 && !UNSAFE_KEYS.has(v) ? v : null;
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
      ...pos(t), type: t.type, label: cleanStr(t.label, 40), ...(t.headZone ? { headZone: true } : {}),
      ...(cleanNum(t.rot, 0, 0, 359) ? { rot: Math.round(cleanNum(t.rot, 0, 0, 359)) } : {}),
      ...(HARDCOVER_SIDES.includes(t.hardcover) ? { hardcover: t.hardcover } : {}),
      ...(t.activatedBy !== undefined && t.activatedBy !== null ? { activatedBy: cleanInt(t.activatedBy, -1, 0, 499) } : {})
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
      ...pos(pr), type: pr.type, label: cleanStr(pr.label, 40),
      ...(cleanNum(pr.rot, 0, 0, 359) ? { rot: Math.round(cleanNum(pr.rot, 0, 0, 359)) } : {})
    })),
    path: cleanArr(raw.path).filter(Array.isArray).map(pt => [coord(pt[0]), coord(pt[1])])
  };
  // Auslöser nur auf vorhandene Stahlziele zeigen lassen
  layout.targets.forEach((t, i) => {
    if (t.activatedBy === undefined) return;
    const act = layout.targets[t.activatedBy];
    if (t.activatedBy === i || !act || !["steel", "popper", "minipopper"].includes(act.type)) delete t.activatedBy;
  });
  const faults = cleanArr(raw.faults).filter(isObj).map(f => ({ x1: coord(f.x1), y1: coord(f.y1), x2: coord(f.x2), y2: coord(f.y2) }));
  if (faults.length) layout.faults = faults;
  const texts = cleanArr(raw.texts, 100).filter(isObj).map(tx => ({
    ...pos(tx), text: cleanStr(tx.text, 60).trim(),
    ...(cleanNum(tx.rot, 0, 0, 359) ? { rot: Math.round(cleanNum(tx.rot, 0, 0, 359)) } : {})
  })).filter(tx => tx.text);
  if (texts.length) layout.texts = texts;
  const plan = cleanArr(raw.plan, 300).map(step => {
    if (!isObj(step)) return null;
    if (step.type === "reload") return { type: "reload" };
    const index = cleanInt(step.index, -1, 0, 499);
    return step.type === "target" && index >= 0 && index < layout.targets.length ? { type: "target", index } : null;
  }).filter(Boolean);
  if (plan.length) layout.plan = plan;
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
    ${briefingHtml(drill)}
    ${sketchHtml}
    ${planListHtml(drill.layout || {})}
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
// Die CSP (style-src 'self') blockiert style="…"-Attribute aus innerHTML-Strings.
// Balkenbreiten werden deshalb über data-bar-width transportiert und hier per CSSOM
// zugewiesen – das ist von style-src nicht betroffen, weil dabei kein Stylesheet-Text
// geparst wird, sondern eine einzelne CSSStyleDeclaration-Eigenschaft gesetzt wird.
function applyBarWidths(container) {
  container.querySelectorAll("[data-bar-width]").forEach(el => { el.style.width = el.dataset.barWidth; });
}

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
  return String(str).replace(/[&<>"']/g, (c) => ESCAPE_HTML_MAP[c]);
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
      <label class="timer-mic-toggle"><input type="checkbox" id="timer-mic"> Schüsse per Mikrofon erkennen <span class="badge difficulty">Beta</span></label>
      <div class="timer-shots hidden" id="timer-shots" aria-live="polite"></div>
      <div class="timer-actions">
        <button type="button" class="save-btn timer-start" id="timer-start">Start</button>
        <button type="button" class="tool-btn" id="timer-stop" disabled>Stopp</button>
      </div>
      <button type="button" class="tool-btn timer-to-score hidden" id="timer-to-score">Ergebnis eintragen ↓</button>
      <button type="button" class="tool-btn timer-to-score hidden" id="timer-take-time">Zeit des letzten Schusses übernehmen</button>
      <p class="timer-hint">Lautstärke hoch und am iPhone den Stummschalter ausschalten. Beim Trockentraining keine Munition im Raum.</p>
    </div>`;
}

function initParTimer() {
  const startBtn = document.getElementById("timer-start");
  const stopBtn = document.getElementById("timer-stop");
  if (!startBtn) return;
  startBtn.addEventListener("click", startParTimer);
  document.getElementById("timer-take-time").addEventListener("click", takeMicTimeIntoScore);
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

async function startParTimer() {
  stopParTimer();
  const par = cleanNum(document.getElementById("timer-par").value, 0, 0, 600);
  const reps = cleanInt(document.getElementById("timer-reps").value, 1, 1, 50);
  const [delayMin, delayMax] = document.getElementById("timer-delay").value.split("-").map(Number);
  const useMic = document.getElementById("timer-mic").checked;
  const ctx = getAudioContext();
  const token = ++parTimer.token;
  setTimerToScoreVisible(false);
  setTakeTimeVisible(false);
  parTimer.lastShots = [];
  setTimerRunning(true);

  if (useMic) {
    setTimerText("Mikrofon …", "Zugriff auf das Mikrofon wird angefragt", "armed");
    const micOk = await startMicListening(ctx);
    if (token !== parTimer.token) { stopMicListening(); return; }
    if (!micOk) {
      setTimerText("Ohne Mikrofon", "Mikrofon nicht verfügbar – der Timer läuft ohne Schusserkennung", "armed");
      await new Promise(r => setTimeout(r, 1200));
      if (token !== parTimer.token) return;
    }
    renderShotList();
  }
  requestWakeLock();

  const runRep = (rep) => {
    if (token !== parTimer.token) return;
    const delay = delayMin + Math.random() * (delayMax - delayMin);
    const repText = reps > 1 ? `Durchgang ${rep} von ${reps}` : "Warte auf das Signal";
    setTimerText("Achtung …", repText, "armed");

    if (parTimer.shots.length) parTimer.lastShots = parTimer.shots;
    parTimer.shots = [];
    if (ctx) {
      const t0 = ctx.currentTime + delay;
      scheduleBeep(ctx, t0, 0.35, 2600);
      if (par > 0) {
        scheduleBeep(ctx, t0 + par, 0.15, 2600);
        scheduleBeep(ctx, t0 + par + 0.22, 0.15, 2600);
      }
      // Eigene Signaltöne dürfen nicht als Schuss erkannt werden
      parTimer.startAudio = t0;
      parTimer.ignore = [[t0 - 0.05, t0 + 0.45]];
      if (par > 0) parTimer.ignore.push([t0 + par - 0.05, t0 + par + 0.6]);
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
  // Töne ausklingen lassen; mit Mikrofon noch etwas weiter auf Schüsse hören
  const par = cleanNum((document.getElementById("timer-par") || {}).value, 0, 0, 600);
  const tail = parTimer.mic ? (par > 0 ? 2000 : NO_PAR_RESET_MS) : 600;
  if (parTimer.mic) setTimerText(document.getElementById("timer-display").textContent, "Hört noch auf Schüsse …", "done");
  timerLater(tail, () => {
    if (token !== parTimer.token) return;
    const hadMic = !!parTimer.mic;
    stopMicListening();
    if (parTimer.shots.length) parTimer.lastShots = parTimer.shots;
    setTimerRunning(false);
    setTimerToScoreVisible(true);
    if (hadMic) {
      renderShotList(true);
      setTakeTimeVisible(parTimer.lastShots.length > 0);
      setTimerText(parTimer.lastShots.length ? `${parTimer.lastShots[parTimer.lastShots.length - 1].toFixed(2)} s` : "Keine Schüsse",
        parTimer.lastShots.length ? "Zeit des letzten erkannten Schusses" : "Empfindlichkeit in den Einstellungen erhöhen", "done");
    }
    releaseWakeLock();
  });
}

// ---------- Schusserkennung per Mikrofon ----------
// Erkennt kurze, laute Knallgeräusche (Trockenklick, Schuss) über den Anstieg
// zwischen zwei Abtastwerten. Alles bleibt im Gerät, es wird nichts aufgenommen.

function createShotDetector({ sampleRate, sensitivity = 6, refractoryMs = 120 }) {
  const threshold = 0.6 * Math.pow(0.72, cleanInt(sensitivity, 6, 1, 10) - 1);
  let prev = 0;
  let floor = 0.002;
  let lastShot = -Infinity;
  return {
    threshold,
    process(samples, startTime) {
      const shots = [];
      for (let i = 0; i < samples.length; i++) {
        const x = samples[i];
        const rise = Math.abs(x - prev);
        prev = x;
        floor = floor * 0.9995 + rise * 0.0005;
        const t = startTime + i / sampleRate;
        if (rise > threshold && rise > floor * 8 && (t - lastShot) * 1000 >= refractoryMs) {
          shots.push(t);
          lastShot = t;
        }
      }
      return shots;
    }
  };
}

async function startMicListening(ctx) {
  if (!ctx || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !ctx.createScriptProcessor) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(1024, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const detector = createShotDetector({ sampleRate: ctx.sampleRate, sensitivity: settings.micSensitivity });
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const end = typeof event.playbackTime === "number" ? event.playbackTime : ctx.currentTime;
      for (const t of detector.process(input, end - input.length / ctx.sampleRate)) handleMicShot(t);
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    parTimer.mic = { stream, source, processor, mute };
    return true;
  } catch (e) {
    return false;
  }
}

function stopMicListening() {
  const mic = parTimer.mic;
  if (!mic) return;
  try { mic.processor.onaudioprocess = null; mic.source.disconnect(); mic.processor.disconnect(); mic.mute.disconnect(); } catch (e) { /* bereits getrennt */ }
  mic.stream.getTracks().forEach(track => track.stop());
  parTimer.mic = null;
}

function handleMicShot(audioTime) {
  if (parTimer.startAudio === null || audioTime < parTimer.startAudio) return; // vor dem Signal: ignorieren
  if (parTimer.ignore.some(([from, to]) => audioTime >= from && audioTime <= to)) return;
  parTimer.shots.push(Math.round((audioTime - parTimer.startAudio) * 100) / 100);
  renderShotList();
}

function shotSummary(shots) {
  if (!shots.length) return null;
  return {
    count: shots.length,
    first: shots[0],
    last: shots[shots.length - 1],
    splits: shots.slice(1).map((t, i) => Math.round((t - shots[i]) * 100) / 100)
  };
}

function renderShotList(final = false) {
  const box = document.getElementById("timer-shots");
  if (!box) return;
  const shots = final ? parTimer.lastShots : parTimer.shots;
  box.classList.remove("hidden");
  const sum = shotSummary(shots);
  if (!sum) {
    box.innerHTML = `<span class="timer-shots-empty">${final ? "Keine Schüsse erkannt." : "Mikrofon aktiv – wartet auf Schüsse …"}</span>`;
    return;
  }
  box.innerHTML = `
    <div class="timer-shots-summary">${sum.count} Schuss, erster ${sum.first.toFixed(2)} s${sum.splits.length ? `, Splits Ø ${(sum.splits.reduce((a, b) => a + b, 0) / sum.splits.length).toFixed(2)} s` : ""}</div>
    <ol class="timer-shot-list">${shots.map((t, i) => `<li>${t.toFixed(2)} s${i ? ` <span>(+${sum.splits[i - 1].toFixed(2)})</span>` : ""}</li>`).join("")}</ol>`;
}

function setTakeTimeVisible(visible) {
  const btn = document.getElementById("timer-take-time");
  if (btn) btn.classList.toggle("hidden", !visible || !document.getElementById("score-section"));
}

function takeMicTimeIntoScore() {
  const sum = shotSummary(parTimer.lastShots);
  const timeInput = document.getElementById("score-time");
  if (!sum || !timeInput) return;
  timeInput.value = sum.last.toFixed(2);
  timeInput.dispatchEvent(new Event("input"));
  jumpToScoreForm();
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
  stopMicListening();
  parTimer.startAudio = null;
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

// Wie buildShareLink, aber für mehrere Übungen auf einmal (eigener Hash-Präfix
// #tm=, damit sich Links mit einer und mit mehreren Übungen unterscheiden lassen).
async function buildMultiShareLink(drills) {
  const bytes = new TextEncoder().encode(JSON.stringify(drills.map(compactForLink)));
  let prefix = "p", payload = bytes;
  if (typeof CompressionStream === "function") {
    try {
      payload = await transformBytes(bytes, new CompressionStream("deflate-raw"), MAX_SHARED_BYTES);
      prefix = "z";
    } catch (e) { /* ohne Kompression weiter */ }
  }
  return location.origin + location.pathname + SHARE_MULTI_HASH_PREFIX + prefix + bytesToBase64Url(payload);
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

async function decodeMultiSharedHash(hash) {
  const m = /#tm=([zp])([A-Za-z0-9_-]+)$/.exec(hash || "");
  if (!m) return null;
  let bytes = base64UrlToBytes(m[2]);
  if (bytes.length > MAX_SHARED_BYTES) throw new Error("Link zu lang");
  if (m[1] === "z") {
    if (typeof DecompressionStream !== "function") throw new Error("Browser zu alt");
    bytes = await transformBytes(bytes, new DecompressionStream("deflate-raw"), MAX_SHARED_BYTES * 5);
  }
  const arr = JSON.parse(new TextDecoder().decode(bytes));
  return Array.isArray(arr) ? cleanArr(arr, 100).map(sanitizeDrill).filter(Boolean) : null;
}

function clearSharedLinkFromUrl() {
  if ((location.hash.startsWith(SHARE_HASH_PREFIX) || location.hash.startsWith(SHARE_MULTI_HASH_PREFIX)) && history.replaceState) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

async function handleSharedLinkFromUrl() {
  if (location.hash.startsWith(SHARE_MULTI_HASH_PREFIX)) { await openMultiSharedDrills(location.hash); return; }
  if (location.hash.startsWith(SHARE_HASH_PREFIX)) await openSharedDrill(location.hash);
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

// Wie openSharedDrill, aber für einen Link mit mehreren Übungen (siehe
// buildMultiShareLink). Fragt vorher kurz nach, weil dabei – anders als bei
// einer einzelnen Übung – mehrere Einträge auf einmal in die Bibliothek kommen.
async function openMultiSharedDrills(hash) {
  let drills;
  try {
    drills = await decodeMultiSharedHash(hash);
  } catch (e) {
    drills = null;
  }
  clearSharedLinkFromUrl();
  if (!drills || !drills.length) {
    alert("Der Trainings-Link ist unvollständig oder beschädigt. Lass ihn dir bitte noch einmal schicken.");
    return;
  }
  const titles = drills.map(d => d.title);
  const preview = titles.slice(0, 8).join(", ") + (titles.length > 8 ? `, +${titles.length - 8} weitere` : "");
  if (!confirm(`${drills.length} Übung(en) aus dem Link:\n${preview}\n\nZu deiner Bibliothek hinzufügen?`)) return;
  addSharedDrills(drills);
}

function importFromPastedLink() {
  const text = prompt("Geteilten Trainings-Link hier einfügen:");
  if (!text) return;
  const multiIdx = text.indexOf(SHARE_MULTI_HASH_PREFIX);
  if (multiIdx >= 0) {
    openMultiSharedDrills(text.slice(multiIdx).trim());
    return;
  }
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

// Wie addSharedDrill, aber für mehrere Übungen auf einmal (aus openMultiSharedDrills).
function addSharedDrills(drills) {
  let added = 0, duplicates = 0, invalid = 0, lastSaved = null;
  for (const raw of drills) {
    const clean = sanitizeDrill(raw);
    if (!clean) { invalid++; continue; }
    const fp = JSON.stringify(clean);
    const existing = customDrills.find(d => drillFingerprint(d) === fp);
    if (existing) { duplicates++; lastSaved = existing; continue; }
    lastSaved = { ...clean, id: newCustomId(), custom: true };
    customDrills.push(lastSaved);
    added++;
  }
  if (added) saveCustomDrills();
  mergeDrills();
  populateFilters();
  updateRestoreButton();
  render();
  closeDetail();
  const parts = [];
  if (added) parts.push(`${added} Übung(en) hinzugefügt`);
  if (duplicates) parts.push(`${duplicates} bereits vorhanden`);
  if (invalid) parts.push(`${invalid} ungültig`);
  showDbMsg(parts.length ? parts.join(", ") + "." : "Keine gültigen Übungen im Link gefunden.");
  if (lastSaved) openDetail(DRILLS.find(d => d.id === lastSaved.id));
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
    ...(includeScores ? { scoreLogs, favorites: [...favorites], sessions, matches, plans: customPlans, planProgress } : {}),
    ...(!includeScores && customPlans.length ? { plans: customPlans } : {})
  };
  downloadJSON(JSON.stringify(payload, null, 2), "ipsc-training-export.json");
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
  document.getElementById("export-reminder-banner").classList.add("hidden");
  showDbMsg(includeScores
    ? "Export (inkl. Zeiten, Favoriten, Tagebuch, Matches und Plänen) heruntergeladen."
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

// Wie shareDrill, aber für mehrere Übungen auf einmal: nutzt dasselbe Dateiformat
// wie „Alles exportieren“ (type ipsc-training-export), damit importFile() sie ohne
// Änderungen entgegennimmt.
async function shareDrillsAsFile(drills) {
  if (!drills.length) return;
  const payload = { type: "ipsc-training-export", version: 1, exportedAt: new Date().toISOString(), customDrills: drills.map(stripForSharing) };
  const json = JSON.stringify(payload, null, 2);
  const filename = drills.length === 1 ? "ipsc-" + slugify(drills[0].title) + ".json" : `ipsc-auswahl-${drills.length}.json`;

  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([json], filename, { type: "application/json" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
  }

  downloadJSON(json, filename);
  showDbMsg(`${drills.length} Übung(en) als Datei "${filename}" heruntergeladen.`);
}

// ---------- Mehrere Übungen teilen (Auswahl + Link/QR/Datei für alle auf einmal) ----------

function initMultiShare() {
  const overlayEl = document.getElementById("multishare-overlay");
  document.getElementById("share-multi-btn").addEventListener("click", openMultiShare);
  document.getElementById("multishare-close").addEventListener("click", closeMultiShare);
  overlayEl.addEventListener("click", (e) => { if (e.target === overlayEl) closeMultiShare(); });
}

function openMultiShare() {
  renderMultiShare();
  const overlayEl = document.getElementById("multishare-overlay");
  if (overlayEl.classList.contains("hidden")) {
    overlayEl.classList.remove("hidden");
    lockBodyScroll();
  }
}

function closeMultiShare() {
  const overlayEl = document.getElementById("multishare-overlay");
  if (!overlayEl || overlayEl.classList.contains("hidden")) return;
  overlayEl.classList.add("hidden");
  unlockBodyScroll();
}

function renderMultiShare() {
  const box = document.getElementById("multishare-content");
  box.innerHTML = `
    <h2>Mehrere Übungen teilen</h2>
    <p class="settings-note">Übungen auswählen und als einen gemeinsamen Link oder QR-Code teilen – praktisch, um mehrere am PC gezeichnete Stages aufs Handy zu bekommen.</p>
    <input type="search" id="ms-search" class="journal-search" placeholder="Übung suchen …" autocomplete="off">
    <div class="journal-drills" id="ms-drills">
      ${DRILLS.map(d => `<label class="journal-drill" data-search="${escapeHtml(drillSearchText(d))}"><input type="checkbox" value="${escapeHtml(d.id)}"> ${escapeHtml(d.title)}</label>`).join("")}
    </div>
    <div class="share-options">
      <span id="ms-count">0 ausgewählt</span>
      <button type="button" class="tool-btn" id="ms-link-btn" disabled>Link teilen</button>
      <button type="button" class="tool-btn" id="ms-qr-btn" disabled>QR-Code zeigen</button>
      <button type="button" class="tool-btn" id="ms-file-btn" disabled>Als Datei</button>
    </div>
    <div id="ms-output" class="share-output"></div>
  `;

  const search = document.getElementById("ms-search");
  search.addEventListener("input", () => {
    const terms = normalizeSearch(search.value).split(/\s+/).filter(Boolean);
    box.querySelectorAll(".journal-drill").forEach(label => {
      label.classList.toggle("hidden", !terms.every(t => label.dataset.search.includes(t)));
    });
  });

  const countEl = document.getElementById("ms-count");
  const linkBtn = document.getElementById("ms-link-btn");
  const qrBtn = document.getElementById("ms-qr-btn");
  const fileBtn = document.getElementById("ms-file-btn");
  const output = document.getElementById("ms-output");
  const selectedDrills = () => [...box.querySelectorAll(".journal-drill input:checked")]
    .map(cb => DRILLS.find(d => d.id === cb.value)).filter(Boolean);
  const updateCount = () => {
    const n = selectedDrills().length;
    countEl.textContent = n === 1 ? "1 ausgewählt" : `${n} ausgewählt`;
    linkBtn.disabled = qrBtn.disabled = fileBtn.disabled = n === 0;
    output.innerHTML = "";
  };
  box.querySelectorAll(".journal-drill input").forEach(cb => cb.addEventListener("change", updateCount));

  const showLinkField = (link, note) => {
    output.innerHTML = `
      <p class="share-note">${escapeHtml(note)}</p>
      <input type="text" class="share-link-field" readonly value="${escapeHtml(link)}" aria-label="Trainings-Link">
    `;
    const field = output.querySelector(".share-link-field");
    field.addEventListener("focus", () => field.select());
  };

  linkBtn.addEventListener("click", async () => {
    const drills = selectedDrills();
    if (!drills.length) return;
    const link = await buildMultiShareLink(drills);
    if (navigator.share) {
      try {
        await navigator.share({ title: `${drills.length} IPSC-Übungen`, text: `${drills.length} IPSC-Übungen`, url: link });
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

  qrBtn.addEventListener("click", async () => {
    const drills = selectedDrills();
    if (!drills.length) return;
    const link = await buildMultiShareLink(drills);
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
        <p class="share-note">Mit der Handykamera scannen, um die ${drills.length} Übungen zu öffnen.</p>
      `;
    } catch (e) {
      showLinkField(link, "Die Auswahl ist zu umfangreich für einen QR-Code. Teile stattdessen den Link, oder wähle weniger Übungen aus:");
    }
  });

  fileBtn.addEventListener("click", () => shareDrillsAsFile(selectedDrills()));
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

      let sessionsAdded = 0;
      if (Array.isArray(data.sessions)) {
        const known = new Set(sessions.map(x => x.id));
        for (const raw of sanitizeSessions(data.sessions)) {
          if (known.has(raw.id)) continue;
          raw.drillIds = raw.drillIds.map(id => idMap[id] || (builtinIds.has(id) ? id : null)).filter(Boolean);
          sessions.push(raw);
          known.add(raw.id);
          sessionsAdded++;
        }
        if (sessionsAdded) saveSessions();
      }

      const mapDrillId = id => idMap[id] || (builtinIds.has(id) ? id : null);
      let matchesAdded = 0, plansAdded = 0;
      if (Array.isArray(data.matches)) {
        const known = new Set(matches.map(m => m.id));
        for (const m of sanitizeMatches(data.matches)) {
          if (known.has(m.id)) continue;
          m.stages.forEach(st => { st.drillId = st.drillId ? mapDrillId(st.drillId) : null; });
          matches.push(m); known.add(m.id); matchesAdded++;
        }
        if (matchesAdded) saveMatches();
      }
      if (Array.isArray(data.plans)) {
        const known = new Set(customPlans.map(pl => pl.id));
        for (const pl of sanitizePlans(data.plans)) {
          if (known.has(pl.id)) continue;
          pl.days.forEach(day => { day.items = day.items.map(it => ({ ...it, drillId: mapDrillId(it.drillId) })).filter(it => it.drillId); });
          customPlans.push(pl); known.add(pl.id); plansAdded++;
        }
        if (plansAdded) saveCustomPlans();
      }
      if (data.planProgress && typeof data.planProgress === "object") {
        const incoming = sanitizePlanProgress(data.planProgress);
        for (const [planId, prog] of Object.entries(incoming)) if (!planProgress[planId]) planProgress[planId] = prog;
        savePlanProgress();
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
      if (sessionsAdded) parts.push(`${sessionsAdded} Trainingseinheit(en) übernommen`);
      if (matchesAdded) parts.push(`${matchesAdded} Match(es) übernommen`);
      if (plansAdded) parts.push(`${plansAdded} Trainingsplan/-pläne übernommen`);
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

function resetBuilder() {
  builderLayout = emptyBuilderLayout();
  pendingPoint = null;
  historyStack = [];
  builderSelection = null;
  pickActivatorFor = null;
  fitBuilderView();
  renderBuilderPreview();
}

function clearBuilderKeepSize() {
  const { viewW, viewH } = builderLayout;
  builderLayout = { ...emptyBuilderLayout(), viewW, viewH };
  pendingPoint = null;
  historyStack = [];
  builderSelection = null;
  pickActivatorFor = null;
  renderBuilderPreview();
}

function ensureBuilderArrays() {
  const empty = emptyBuilderLayout();
  for (const key of Object.keys(empty)) {
    if (Array.isArray(empty[key]) && !Array.isArray(builderLayout[key])) builderLayout[key] = [];
  }
}

function selectBuilderTool(tool) {
  builderTool = tool;
  pendingPoint = null;
  pickActivatorFor = null;
  document.querySelectorAll(".tool-select").forEach(b => b.classList.toggle("active", b.dataset.tool === tool));
  if (builderHint) builderHint.textContent = (TOOL_HINTS[tool] || "") + (tool === "select" || tool === "delete" || tool === "plan" ? "" : DRAG_HINT);
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
    btn.addEventListener("click", () => selectBuilderTool(btn.dataset.tool));
  });

  builderSvg.addEventListener("pointerdown", onBuilderPointerDown);
  builderSvg.addEventListener("pointermove", onBuilderPointerMove);
  builderSvg.addEventListener("pointerup", onBuilderPointerUp);
  builderSvg.addEventListener("pointercancel", onBuilderPointerCancel);
  builderSvg.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomBuilderAt(clientToSvg(e.clientX, e.clientY), e.deltaY < 0 ? 1 / 1.15 : 1.15);
  }, { passive: false });

  document.getElementById("undo-btn").addEventListener("click", undoBuilder);
  document.getElementById("clear-builder-btn").addEventListener("click", clearBuilderKeepSize);
  document.getElementById("plan-reload-btn").addEventListener("click", () => {
    builderLayout.plan = builderLayout.plan || [];
    builderLayout.plan.push({ type: "reload" });
    historyStack.push({ type: "plan" });
    renderBuilderPreview();
  });
  document.getElementById("plan-clear-btn").addEventListener("click", () => {
    builderLayout.plan = [];
    historyStack = historyStack.filter(h => h.type !== "plan");
    renderBuilderPreview();
  });

  document.getElementById("open-stage-editor").addEventListener("click", openStageEditor);
  const preview = document.getElementById("builder-preview");
  preview.addEventListener("click", openStageEditor);
  preview.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openStageEditor(); } });
  document.getElementById("se-done").addEventListener("click", closeStageEditor);
  document.getElementById("se-zoom-in").addEventListener("click", () => zoomBuilderAt(null, 1 / 1.3));
  document.getElementById("se-zoom-out").addEventListener("click", () => zoomBuilderAt(null, 1.3));
  document.getElementById("se-fit").addEventListener("click", () => { fitBuilderView(); renderBuilderPreview(); });
  document.getElementById("se-snap").addEventListener("change", (e) => { builderSnap = e.target.checked; });
  ["se-width", "se-depth"].forEach(id => document.getElementById(id).addEventListener("change", applyStageSize));

  selectBuilderTool("select");
  resetBuilder();
}

// ---------- Ansicht: Einpassen, Zoomen, Verschieben ----------

function fitBuilderView() {
  const pad = GRID_UNIT;
  builderView.x = -pad;
  builderView.y = -pad;
  builderView.w = (builderLayout.viewW || 400) + 2 * pad;
  builderView.h = (builderLayout.viewH || 500) + 2 * pad;
  applyBuilderView();
}

function applyBuilderView() {
  if (builderSvg) builderSvg.setAttribute("viewBox", `${builderView.x.toFixed(1)} ${builderView.y.toFixed(1)} ${builderView.w.toFixed(1)} ${builderView.h.toFixed(1)}`);
}

function zoomBuilderAt(point, factor) {
  const maxW = ((builderLayout.viewW || 400) + 2 * GRID_UNIT) * 3;
  const newW = Math.min(maxW, Math.max(GRID_UNIT * 3, builderView.w * factor));
  const k = newW / builderView.w;
  const p = point || { x: builderView.x + builderView.w / 2, y: builderView.y + builderView.h / 2 };
  builderView.x = p.x - (p.x - builderView.x) * k;
  builderView.y = p.y - (p.y - builderView.y) * k;
  builderView.w = newW;
  builderView.h = builderView.h * k;
  applyBuilderView();
}

function builderScreenInfo() {
  const rect = builderSvg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const scale = Math.min(rect.width / builderView.w, rect.height / builderView.h);
  return { rect, scale, offX: (rect.width - builderView.w * scale) / 2, offY: (rect.height - builderView.h * scale) / 2 };
}

function clientToSvg(clientX, clientY) {
  const info = builderScreenInfo();
  if (!info) return { x: 0, y: 0 };
  return {
    x: builderView.x + (clientX - info.rect.left - info.offX) / info.scale,
    y: builderView.y + (clientY - info.rect.top - info.offY) / info.scale
  };
}

function svgPoint(e) {
  const p = clientToSvg(e.clientX, e.clientY);
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

function snapPoint(p) {
  if (!builderSnap) return { x: Math.round(p.x), y: Math.round(p.y) };
  const step = GRID_UNIT / 2; // halber Meter
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

function applyStageSize() {
  const w = cleanInt(document.getElementById("se-width").value, 20, 5, 100);
  const d = cleanInt(document.getElementById("se-depth").value, 25, 5, 100);
  builderLayout.viewW = w * GRID_UNIT;
  builderLayout.viewH = d * GRID_UNIT;
  updateStageSizeInputs();
  fitBuilderView();
  renderBuilderPreview();
}

function updateStageSizeInputs() {
  const wIn = document.getElementById("se-width"), dIn = document.getElementById("se-depth");
  if (wIn) wIn.value = Math.round((builderLayout.viewW || 400) / GRID_UNIT);
  if (dIn) dIn.value = Math.round((builderLayout.viewH || 500) / GRID_UNIT);
}

function openStageEditor() {
  const editor = document.getElementById("stage-editor");
  ensureBuilderArrays();
  editor.classList.remove("hidden");
  document.body.classList.add("stage-editor-open");
  updateStageSizeInputs();
  fitBuilderView();
  renderBuilderPreview();
}

function closeStageEditor() {
  const editor = document.getElementById("stage-editor");
  if (!editor || editor.classList.contains("hidden")) return false;
  editor.classList.add("hidden");
  document.body.classList.remove("stage-editor-open");
  builderSelection = null;
  pickActivatorFor = null;
  pendingPoint = null;
  renderBuilderPreview();
  return true;
}

// ---------- Treffertest ----------

function targetHitRadius(t) {
  return t.type === "mini" ? 17 : t.type === "minipopper" || t.type === "metalns" || t.type === "steel" ? 15 : 24;
}

function hitTestBuilder(p) {
  const L = builderLayout;
  for (let i = (L.texts || []).length - 1; i >= 0; i--) {
    const t = L.texts[i];
    const halfW = Math.max(12, (t.text || "").length * 3.6);
    if (Math.abs(t.x - p.x) <= halfW && Math.abs(t.y - 4 - p.y) <= 10) return { kind: "text", index: i };
  }
  for (let i = L.targets.length - 1; i >= 0; i--) {
    const t = L.targets[i];
    if (Math.hypot(t.x - p.x, t.y - p.y) <= targetHitRadius(t)) return { kind: "target", index: i };
  }
  for (let i = L.shooterPositions.length - 1; i >= 0; i--) {
    const s = L.shooterPositions[i];
    if (Math.hypot(s.x - p.x, s.y - p.y) <= 18) return { kind: "shooter", index: i };
  }
  for (let i = (L.props || []).length - 1; i >= 0; i--) {
    const pr = L.props[i];
    if (Math.hypot(pr.x - p.x, pr.y - p.y) <= (pr.type === "port" || pr.type === "tuer" ? 30 : 26)) return { kind: "prop", index: i };
  }
  for (let i = L.boxes.length - 1; i >= 0; i--) {
    const b = L.boxes[i];
    const onEdge = p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6;
    if (onEdge) return { kind: "box", index: i };
  }
  for (const [list, kind] of [[L.walls, "wall"], [L.faults || [], "fault"]]) {
    for (let i = list.length - 1; i >= 0; i--) {
      const w = list[i];
      if (Math.hypot(w.x1 - p.x, w.y1 - p.y) <= 14) return { kind: `${kind}-start`, index: i };
      if (Math.hypot(w.x2 - p.x, w.y2 - p.y) <= 14) return { kind: `${kind}-end`, index: i };
      if (distanceToSegment(p, w) <= 7) return { kind: `${kind}-line`, index: i };
    }
  }
  for (let i = (L.path || []).length - 1; i >= 0; i--) {
    const pt = L.path[i];
    if (Math.hypot(pt[0] - p.x, pt[1] - p.y) <= 14) return { kind: "path-point", index: i };
  }
  return null;
}

function distanceToSegment(p, s) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - s.x1) * dx + (p.y - s.y1) * dy) / len2));
  return Math.hypot(p.x - (s.x1 + t * dx), p.y - (s.y1 + t * dy));
}

// ---------- Zeiger: Tippen, Ziehen, Verschieben, Zoomen ----------

function onBuilderPointerDown(e) {
  builderPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { builderSvg.setPointerCapture(e.pointerId); } catch (err) { /* nicht unterstützt */ }

  if (builderPointers.size === 2) {
    const [a, b] = [...builderPointers.values()];
    builderPinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: clientToSvg((a.x + b.x) / 2, (a.y + b.y) / 2),
      view: { ...builderView }
    };
    dragState = null;
    builderPanState = null;
    pointerDownPoint = null;
    return;
  }
  if (builderPointers.size > 2) return;

  const p = svgPoint(e);
  const hit = hitTestBuilder(p);
  didDrag = false;
  pointerDownPoint = p;
  builderPointerDownClient = { x: e.clientX, y: e.clientY };
  builderPanState = null;
  if (hit) {
    let offsetX = 0, offsetY = 0;
    const el = elementRef(hit);
    if (hit.kind === "box") { offsetX = p.x - el.x; offsetY = p.y - el.y; }
    if (hit.kind === "wall-line" || hit.kind === "fault-line") { offsetX = p.x - el.x1; offsetY = p.y - el.y1; }
    dragState = { ...hit, offsetX, offsetY };
  } else {
    dragState = null;
    builderPanState = { view: { ...builderView }, client: { x: e.clientX, y: e.clientY } };
  }
}

function onBuilderPointerMove(e) {
  if (!builderPointers.has(e.pointerId)) return;
  builderPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (builderPinch && builderPointers.size >= 2) {
    const [a, b] = [...builderPointers.values()];
    const k = builderPinch.dist / (Math.hypot(a.x - b.x, a.y - b.y) || 1);
    Object.assign(builderView, builderPinch.view);
    zoomBuilderAt(builderPinch.mid, k);
    const info = builderScreenInfo();
    if (info) {
      const midNow = clientToSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      builderView.x += builderPinch.mid.x - midNow.x;
      builderView.y += builderPinch.mid.y - midNow.y;
      applyBuilderView();
    }
    return;
  }
  if (!pointerDownPoint || !builderPointerDownClient) return;
  const moved = Math.hypot(e.clientX - builderPointerDownClient.x, e.clientY - builderPointerDownClient.y);
  if (!didDrag && moved > 6) didDrag = true;
  if (!didDrag) return;

  if (dragState) {
    if (builderTool === "delete" || builderTool === "plan" || pickActivatorFor !== null) return;
    moveElement(dragState, snapPoint(svgPoint(e)));
    renderBuilderPreview();
  } else if (builderPanState) {
    const info = builderScreenInfo();
    if (!info) return;
    builderView.x = builderPanState.view.x - (e.clientX - builderPanState.client.x) / info.scale;
    builderView.y = builderPanState.view.y - (e.clientY - builderPanState.client.y) / info.scale;
    applyBuilderView();
  }
}

function onBuilderPointerCancel(e) {
  builderPointers.delete(e.pointerId);
  if (builderPointers.size < 2) builderPinch = null;
  dragState = null;
  builderPanState = null;
  pointerDownPoint = null;
}

function onBuilderPointerUp(e) {
  builderPointers.delete(e.pointerId);
  if (builderPinch) {
    if (builderPointers.size < 2) builderPinch = null;
    dragState = null;
    builderPanState = null;
    pointerDownPoint = null;
    return;
  }
  if (!pointerDownPoint) return;
  const hit = dragState;
  const moved = didDrag;
  dragState = null;
  builderPanState = null;
  pointerDownPoint = null;
  didDrag = false;
  if (moved) return; // Verschieben oder Ansicht bewegen ist abgeschlossen

  handleBuilderTap(svgPoint(e), hit);
}

function handleBuilderTap(p, hit) {
  if (pickActivatorFor !== null) {
    const target = builderLayout.targets[pickActivatorFor];
    if (hit && hit.kind === "target" && ACTIVATOR_TYPES.includes(builderLayout.targets[hit.index].type) && target) {
      target.activatedBy = hit.index;
      builderSelection = { kind: "target", index: pickActivatorFor };
    }
    pickActivatorFor = null;
    if (builderHint) builderHint.textContent = TOOL_HINTS[builderTool] || "";
    renderBuilderPreview();
    return;
  }
  if (hit) {
    if (builderTool === "delete") deleteElement(hit);
    else if (builderTool === "plan" && hit.kind === "target") { addPlanTarget(hit.index); return; }
    else builderSelection = { kind: hit.kind.replace(/-(start|end|line)$/, ""), index: hit.index };
    renderBuilderPreview();
    return;
  }
  if (builderTool === "select" || builderTool === "delete") {
    builderSelection = null;
    renderBuilderPreview();
    return;
  }
  placeAtPoint(snapPoint(p));
}

function elementRef(hit) {
  const L = builderLayout;
  const kind = hit.kind.replace(/-(start|end|line)$/, "");
  const lists = { target: L.targets, shooter: L.shooterPositions, box: L.boxes, prop: L.props, text: L.texts, wall: L.walls, fault: L.faults };
  return lists[kind] ? lists[kind][hit.index] : null;
}

function moveElement(drag, p) {
  const L = builderLayout;
  const el = elementRef(drag);
  if (drag.kind === "path-point") { L.path[drag.index] = [p.x, p.y]; return; }
  if (!el) return;
  if (drag.kind === "box") { el.x = p.x - drag.offsetX; el.y = p.y - drag.offsetY; return; }
  if (drag.kind.endsWith("-start")) { el.x1 = p.x; el.y1 = p.y; return; }
  if (drag.kind.endsWith("-end")) { el.x2 = p.x; el.y2 = p.y; return; }
  if (drag.kind.endsWith("-line")) {
    const dx = el.x2 - el.x1, dy = el.y2 - el.y1;
    el.x1 = p.x - drag.offsetX; el.y1 = p.y - drag.offsetY;
    el.x2 = el.x1 + dx; el.y2 = el.y1 + dy;
    return;
  }
  el.x = p.x;
  el.y = p.y;
}

// ---------- Elemente setzen, löschen, bearbeiten ----------

function deleteElement(hit) {
  const L = builderLayout;
  const kind = hit.kind.replace(/-(start|end|line)$/, "");
  if (kind === "target") {
    L.targets.splice(hit.index, 1);
    // Schussplan und Auslöser an die neuen Positionen anpassen
    L.plan = (L.plan || [])
      .filter(step => !(step.type === "target" && step.index === hit.index))
      .map(step => step.type === "target" && step.index > hit.index ? { type: "target", index: step.index - 1 } : step);
    for (const t of L.targets) {
      if (t.activatedBy === hit.index) delete t.activatedBy;
      else if (typeof t.activatedBy === "number" && t.activatedBy > hit.index) t.activatedBy--;
    }
  } else if (kind === "shooter") L.shooterPositions.splice(hit.index, 1);
  else if (kind === "box") L.boxes.splice(hit.index, 1);
  else if (kind === "prop") L.props.splice(hit.index, 1);
  else if (kind === "text") L.texts.splice(hit.index, 1);
  else if (kind === "wall") L.walls.splice(hit.index, 1);
  else if (kind === "fault") L.faults.splice(hit.index, 1);
  else if (kind === "path-point") L.path.splice(hit.index, 1);
  builderSelection = null;
}

function nextLabel(type) {
  const prefix = LABEL_PREFIX[type] || "T";
  return prefix + (builderLayout.targets.filter(t => t.type === type).length + 1);
}

function placeAtPoint(p) {
  const L = builderLayout;
  ensureBuilderArrays();
  const toolTarget = { target: "paper", steel: "steel" }[builderTool] || (TARGET_NAMES[builderTool] ? builderTool : null);
  if (toolTarget) {
    L.targets.push({ x: p.x, y: p.y, type: toolTarget, label: nextLabel(toolTarget) });
    historyStack.push({ type: "targets" });
    builderSelection = { kind: "target", index: L.targets.length - 1 };
  } else if (builderTool === "shooter") {
    L.shooterPositions.push({ x: p.x, y: p.y, facing: 0, label: L.shooterPositions.length === 0 ? "Start" : "Position " + (L.shooterPositions.length + 1) });
    historyStack.push({ type: "shooterPositions" });
    builderSelection = { kind: "shooter", index: L.shooterPositions.length - 1 };
  } else if (builderTool === "wall" || builderTool === "fault") {
    if (!pendingPoint) {
      pendingPoint = p;
    } else {
      const list = builderTool === "wall" ? L.walls : L.faults;
      list.push({ x1: pendingPoint.x, y1: pendingPoint.y, x2: p.x, y2: p.y });
      historyStack.push({ type: builderTool === "wall" ? "walls" : "faults" });
      pendingPoint = null;
    }
  } else if (builderTool === "box") {
    if (!pendingPoint) {
      pendingPoint = p;
    } else {
      const x = Math.min(pendingPoint.x, p.x), y = Math.min(pendingPoint.y, p.y);
      const w = Math.abs(p.x - pendingPoint.x) || 40, h = Math.abs(p.y - pendingPoint.y) || 40;
      L.boxes.push({ x, y, w, h, label: "Box " + (L.boxes.length + 1) });
      historyStack.push({ type: "boxes" });
      pendingPoint = null;
    }
  } else if (PROP_NAMES[builderTool]) {
    L.props.push({ x: p.x, y: p.y, type: builderTool, label: builderTool === "fass" || builderTool === "port" || builderTool === "tuer" ? "" : PROP_NAMES[builderTool] });
    historyStack.push({ type: "props" });
    builderSelection = { kind: "prop", index: L.props.length - 1 };
  } else if (builderTool === "text") {
    L.texts.push({ x: p.x, y: p.y, text: "Text" });
    historyStack.push({ type: "texts" });
    builderSelection = { kind: "text", index: L.texts.length - 1 };
  } else if (builderTool === "path") {
    L.path.push([p.x, p.y]);
    historyStack.push({ type: "path" });
  }
  renderBuilderPreview();
  if (builderSelection && builderSelection.kind === "text") {
    const input = document.getElementById("se-label");
    if (input) { input.focus(); if (input.select) input.select(); }
  }
}

function undoBuilder() {
  const last = historyStack.pop();
  if (!last) return;
  builderLayout[last.type].pop();
  if (last.type === "targets") {
    const n = builderLayout.targets.length;
    builderLayout.plan = (builderLayout.plan || []).filter(step => step.type !== "target" || step.index < n);
    for (const t of builderLayout.targets) if (typeof t.activatedBy === "number" && t.activatedBy >= n) delete t.activatedBy;
  }
  builderSelection = null;
  renderBuilderPreview();
}

function rotateSelection(delta) {
  const sel = builderSelection;
  if (!sel) return;
  const el = elementRef(sel);
  if (!el) return;
  if (sel.kind === "shooter") {
    el.facing = (((el.facing || 0) + delta) % 360 + 360) % 360;
  } else if (sel.kind === "wall" || sel.kind === "fault") {
    const cx = (el.x1 + el.x2) / 2, cy = (el.y1 + el.y2) / 2, rad = delta * Math.PI / 180;
    const rot = (x, y) => [Math.round(cx + (x - cx) * Math.cos(rad) - (y - cy) * Math.sin(rad)), Math.round(cy + (x - cx) * Math.sin(rad) + (y - cy) * Math.cos(rad))];
    [el.x1, el.y1] = rot(el.x1, el.y1);
    [el.x2, el.y2] = rot(el.x2, el.y2);
  } else {
    el.rot = (((el.rot || 0) + delta) % 360 + 360) % 360;
    if (!el.rot) delete el.rot;
  }
  renderBuilderPreview();
}

function duplicateSelection() {
  const sel = builderSelection;
  const el = sel && elementRef(sel);
  if (!el) return;
  const L = builderLayout;
  const copy = JSON.parse(JSON.stringify(el));
  const off = GRID_UNIT;
  if ("x1" in copy) { copy.x1 += off; copy.x2 += off; copy.y1 += off; copy.y2 += off; } else { copy.x += off; copy.y += off; }
  const map = { target: ["targets", L.targets], shooter: ["shooterPositions", L.shooterPositions], box: ["boxes", L.boxes], prop: ["props", L.props], text: ["texts", L.texts], wall: ["walls", L.walls], fault: ["faults", L.faults] };
  const [type, list] = map[sel.kind];
  if (sel.kind === "target") { copy.label = nextLabel(copy.type); delete copy.activatedBy; }
  list.push(copy);
  historyStack.push({ type });
  builderSelection = { kind: sel.kind, index: list.length - 1 };
  renderBuilderPreview();
}

function renderSelectionPanel() {
  const panel = document.getElementById("se-panel");
  if (!panel) return;
  const sel = builderSelection;
  const el = sel && elementRef(sel);
  if (!el) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }
  const name = sel.kind === "target" ? TARGET_NAMES[el.type]
    : sel.kind === "prop" ? PROP_NAMES[el.type]
    : { shooter: "Schützenposition", box: "Box", text: "Text", wall: "Wand", fault: "Fault Line" }[sel.kind];
  const hasLabel = ["target", "shooter", "box", "prop", "text"].includes(sel.kind);
  const labelValue = sel.kind === "text" ? el.text : el.label;
  const canRotate = sel.kind !== "box";
  const isActivated = sel.kind === "target" && ACTIVATED_TYPES.includes(el.type);
  const activator = isActivated && typeof el.activatedBy === "number" ? builderLayout.targets[el.activatedBy] : null;
  panel.innerHTML = `
    <div class="se-panel-head">
      <strong>${escapeHtml(name || "Element")}</strong>
      <button type="button" class="close-btn se-panel-close" id="se-panel-close" aria-label="Auswahl aufheben">×</button>
    </div>
    <div class="se-panel-body">
      ${hasLabel ? `<label class="score-field se-label-field"><span>${sel.kind === "text" ? "Text" : "Beschriftung"}</span><input type="text" id="se-label" maxlength="${sel.kind === "text" ? 60 : 40}" value="${escapeHtml(labelValue || "")}"></label>` : ""}
      ${canRotate ? `<div class="se-rotate">
        <button type="button" class="tool-btn" data-rot="-45">↺ 45°</button>
        <button type="button" class="tool-btn" data-rot="-15">↺ 15°</button>
        <button type="button" class="tool-btn" data-rot="15">↻ 15°</button>
        <button type="button" class="tool-btn" data-rot="45">↻ 45°</button>
      </div>` : ""}
      ${sel.kind === "target" && HARDCOVER_TYPES.includes(el.type) ? `<label class="score-field"><span>Hardcover</span>
        <select id="se-hardcover">
          ${[["", "keins"], ["left", "linke Hälfte"], ["right", "rechte Hälfte"], ["top", "obere Hälfte"], ["bottom", "untere Hälfte"]]
            .map(([v, l]) => `<option value="${v}"${(el.hardcover || "") === v ? " selected" : ""}>${l}</option>`).join("")}
        </select></label>` : ""}
      ${isActivated ? `<div class="se-activator">
        <span>${activator ? `Aktiviert durch ${escapeHtml(activator.label || "Stahlziel")}` : "Kein Auslöser"}</span>
        <button type="button" class="tool-btn" id="se-pick-activator">${activator ? "Auslöser ändern" : "Auslöser wählen"}</button>
        ${activator ? `<button type="button" class="tool-btn" id="se-clear-activator">entfernen</button>` : ""}
      </div>` : ""}
      <div class="se-panel-actions">
        <button type="button" class="tool-btn" id="se-duplicate">Duplizieren</button>
        <button type="button" class="delete-btn" id="se-delete">Löschen</button>
      </div>
    </div>`;
  panel.classList.remove("hidden");

  document.getElementById("se-panel-close").addEventListener("click", () => { builderSelection = null; renderBuilderPreview(); });
  const labelInput = document.getElementById("se-label");
  if (labelInput) labelInput.addEventListener("input", () => {
    if (sel.kind === "text") el.text = labelInput.value; else el.label = labelInput.value;
    renderBuilderCanvas();
  });
  panel.querySelectorAll("[data-rot]").forEach(btn => btn.addEventListener("click", () => rotateSelection(Number(btn.dataset.rot))));
  const hc = document.getElementById("se-hardcover");
  if (hc) hc.addEventListener("change", () => {
    if (hc.value) el.hardcover = hc.value; else delete el.hardcover;
    renderBuilderCanvas();
  });
  const pick = document.getElementById("se-pick-activator");
  if (pick) pick.addEventListener("click", () => {
    pickActivatorFor = sel.index;
    if (builderHint) builderHint.textContent = "Tippe auf die Plate oder den Popper, der dieses Ziel auslöst.";
  });
  const clearAct = document.getElementById("se-clear-activator");
  if (clearAct) clearAct.addEventListener("click", () => { delete el.activatedBy; renderBuilderPreview(); });
  document.getElementById("se-duplicate").addEventListener("click", duplicateSelection);
  document.getElementById("se-delete").addEventListener("click", () => { deleteElement(sel); renderBuilderPreview(); });
}

function selectionHighlightSvg() {
  const sel = builderSelection;
  const el = sel && elementRef(sel);
  if (!el) return "";
  const style = `fill="none" stroke="#7fb0e8" stroke-width="2" stroke-dasharray="5,4" vector-effect="non-scaling-stroke"`;
  if (sel.kind === "box") return `<rect x="${el.x - 5}" y="${el.y - 5}" width="${el.w + 10}" height="${el.h + 10}" ${style}/>`;
  if (sel.kind === "wall" || sel.kind === "fault") {
    return `<circle cx="${el.x1}" cy="${el.y1}" r="9" ${style}/><circle cx="${el.x2}" cy="${el.y2}" r="9" ${style}/>`;
  }
  const r = sel.kind === "target" ? targetHitRadius(el) + 6 : sel.kind === "text" ? Math.max(18, (el.text || "").length * 4) : 26;
  return `<circle cx="${el.x}" cy="${sel.kind === "text" ? el.y - 4 : el.y}" r="${r}" ${style}/>`;
}

function renderBuilderCanvas() {
  if (!builderSvg) return;
  let extra = "";
  if (pendingPoint) {
    extra += `<circle cx="${pendingPoint.x}" cy="${pendingPoint.y}" r="6" fill="none" stroke="#e8620c" stroke-width="2" stroke-dasharray="3,2"/>`;
  }
  builderSvg.innerHTML = `
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#8a92a0"/>
      </marker>
    </defs>
    ${renderLayoutInner(builderLayout)}
    ${selectionHighlightSvg()}
    ${extra}
  `;
  applyBuilderView();
  const preview = document.getElementById("builder-preview");
  if (preview) preview.innerHTML = renderLayout(builderLayout);
}

function renderBuilderPreview() {
  renderBuilderCanvas();
  renderSelectionPanel();
  updateBuilderSummary();
}

// ---------- SVG Layout Renderer ----------

function renderLayoutInner(layout) {
  const w = layout.viewW || 400;
  const h = layout.viewH || 500;
  let parts = [];

  parts.push(gridBackground(w, h));

  for (const f of layout.faults || []) {
    parts.push(`<line x1="${f.x1}" y1="${f.y1}" x2="${f.x2}" y2="${f.y2}" stroke="#d9412b" stroke-width="4" stroke-linecap="round"><title>Fault Line</title></line>`);
  }

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

  (layout.targets || []).forEach(t => {
    const act = typeof t.activatedBy === "number" ? layout.targets[t.activatedBy] : null;
    if (act) {
      parts.push(`<g class="activator-link"><line x1="${act.x}" y1="${act.y}" x2="${t.x}" y2="${t.y}" stroke="#f2c14e" stroke-width="1.8" stroke-dasharray="6,4"/><circle cx="${act.x}" cy="${act.y}" r="4" fill="#f2c14e"/></g>`);
    }
  });

  for (const t of layout.targets || []) {
    parts.push(targetEl(t));
  }

  for (const tx of layout.texts || []) {
    const svgText = `<text x="${tx.x}" y="${tx.y}" fill="#e9ebee" font-size="13" font-weight="600" text-anchor="middle" font-family="Segoe UI, sans-serif" paint-order="stroke" stroke="#0b0d10" stroke-width="3">${escapeXml(tx.text)}</text>`;
    parts.push(rotWrap(svgText, tx.x, tx.y - 4, tx.rot));
  }

  for (const s of layout.shooterPositions || []) {
    parts.push(shooterEl(s));
  }

  parts.push(planBadgesSvg(layout));

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
  // Feines Raster = 1 m, kräftige Linien = 5 m
  const lines = [];
  for (let x = 0, i = 0; x <= w; x += GRID_UNIT, i++) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="${i % 5 === 0 ? "#252a31" : "#15181d"}" stroke-width="1"/>`);
  }
  for (let y = 0, i = 0; y <= h; y += GRID_UNIT, i++) {
    lines.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${i % 5 === 0 ? "#252a31" : "#15181d"}" stroke-width="1"/>`);
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

function targetZonesSvg(cx, cy, hw = TARGET_HW, hh = TARGET_HH, hardcover = null) {
  return `
    <polygon points="${shapePoints(TARGET_OUTLINE, cx, cy, hw, hh)}" fill="${TARGET_TAN}" stroke="${TARGET_STROKE}" stroke-width="1.5" stroke-linejoin="round"/>
    <polygon points="${shapePoints(TARGET_C_ZONE, cx, cy, hw, hh)}" fill="none" stroke="${TARGET_STROKE}" stroke-width="0.85" stroke-linejoin="round"/>
    <polygon points="${shapePoints(TARGET_A_ZONE, cx, cy, hw, hh)}" fill="none" stroke="${TARGET_STROKE}" stroke-width="0.85" stroke-linejoin="round"/>
    ${hardcover ? hardcoverSvg(cx, cy, hw, hh, hardcover) : ""}`;
}

// Hardcover: undurchschießbar abgedeckter Teil des Ziels, schwarz gefüllt
function hardcoverSvg(cx, cy, hw, hh, side) {
  let pts = TARGET_OUTLINE.map(([nx, ny]) => [cx + nx * hw, cy + ny * hh]);
  const axis = side === "left" || side === "right" ? 0 : 1;
  const limit = axis === 0 ? cx : cy;
  const keep = pt => side === "left" || side === "top" ? pt[axis] <= limit : pt[axis] >= limit;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const inA = keep(a), inB = keep(b);
    if (inA) out.push(a);
    if (inA !== inB) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return `<polygon points="${out.map(([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`).join(" ")}" fill="#111" stroke="#9aa3af" stroke-width="0.8" stroke-dasharray="2,1.5"/>`;
}

function rotWrap(svg, x, y, rot) {
  return rot ? `<g transform="rotate(${rot} ${x} ${y})">${svg}</g>` : svg;
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
  const rot = svg => rotWrap(svg, t.x, t.y, t.rot);
  const title = `<title>${escapeXml(TARGET_NAMES[t.type] || "Ziel")}</title>`;

  if (t.type === "steel") return `<g>${title}${plateSvg(t.x, t.y)}</g>` + labelAt(26);
  if (t.type === "metalns") {
    return `<g>${title}<circle cx="${t.x}" cy="${t.y}" r="12" fill="#f5f3ee" stroke="${ICON_STROKE}" stroke-width="1.5"/></g>` + labelAt(26);
  }
  if (t.type === "popper") return `<g>${title}${rot(popperSvg(t.x, t.y))}</g>` + labelAt(37);
  if (t.type === "minipopper") {
    return `<g>${title}${rot(`<g transform="translate(${t.x} ${t.y}) scale(0.7) translate(${-t.x} ${-t.y})">${popperSvg(t.x, t.y)}</g>`)}</g>` + labelAt(28);
  }
  if (t.type === "noshoot") {
    // No-Shoot: gleiche Silhouette, weiß und ohne Trefferzonen
    return `<g>${title}${rot(`<polygon points="${shapePoints(TARGET_OUTLINE, t.x, t.y)}" fill="#f5f3ee" stroke="${ICON_STROKE}" stroke-width="1.5" stroke-linejoin="round"/>`)}</g>` + labelAt(39);
  }
  if (t.type === "mini") {
    return `<g>${title}${rot(targetZonesSvg(t.x, t.y, MINI_HW, MINI_HH, t.hardcover))}</g>` + labelAt(29);
  }

  const paper = targetZonesSvg(t.x, t.y, TARGET_HW, TARGET_HH, t.hardcover);
  const dim = "#8a92a0";

  if (t.type === "pendler") {
    const arcY = t.y - 20;
    return `<g>${title}${rot(`
        <path d="M ${t.x - 40} ${arcY} A 42 42 0 0 1 ${t.x + 40} ${arcY}" fill="none" stroke="${dim}" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="${t.x - 40}" cy="${arcY}" r="2.5" fill="${dim}"/>
        <circle cx="${t.x + 40}" cy="${arcY}" r="2.5" fill="${dim}"/>
        <line x1="${t.x}" y1="${t.y - 50}" x2="${t.x}" y2="${t.y - TARGET_HH}" stroke="#5a6270" stroke-width="2"/>
        ${paper}`)}</g>` + labelAt(39);
  }

  if (t.type === "updown") {
    const ax = t.x + 30, ay = t.y;
    return `<g>${title}${rot(`${paper}
        <g stroke="${dim}" stroke-width="2" fill="none">
          <line x1="${ax}" y1="${ay - 14}" x2="${ax}" y2="${ay + 14}"/>
          <path d="M ${ax - 4} ${ay - 9} L ${ax} ${ay - 15} L ${ax + 4} ${ay - 9}"/>
          <path d="M ${ax - 4} ${ay + 9} L ${ax} ${ay + 15} L ${ax + 4} ${ay + 9}"/>
        </g>`)}</g>` + labelAt(39);
  }

  if (t.type === "mover") {
    // Mover: Ziel auf einer Schiene, Doppelpfeil für die Bewegungsrichtung
    const ry = t.y + 31;
    return `<g>${title}${rot(`${paper}
        <g stroke="${dim}" stroke-width="2" fill="none">
          <line x1="${t.x - 42}" y1="${ry}" x2="${t.x + 42}" y2="${ry}"/>
          <path d="M ${t.x - 36} ${ry - 5} L ${t.x - 43} ${ry} L ${t.x - 36} ${ry + 5}"/>
          <path d="M ${t.x + 36} ${ry - 5} L ${t.x + 43} ${ry} L ${t.x + 36} ${ry + 5}"/>
        </g>`)}</g>` + labelAt(47);
  }

  if (t.type === "dropturner") {
    // Drop Turner: Ziel klappt/dreht nach dem Auslösen, gebogener Pfeil
    const cx = t.x + 31;
    return `<g>${title}${rot(`${paper}
        <g stroke="${dim}" stroke-width="2" fill="none">
          <path d="M ${cx - 4} ${t.y - 16} A 16 16 0 0 1 ${cx - 4} ${t.y + 16}"/>
          <path d="M ${cx - 10} ${t.y + 12} L ${cx - 4} ${t.y + 17} L ${cx - 2} ${t.y + 9}"/>
        </g>`)}</g>` + labelAt(39);
  }

  if (t.type === "clamshell") {
    // Clamshell: Abdeckung vor dem Ziel, die nach dem Auslösen wegklappt
    return `<g>${title}${rot(`${paper}
        <rect x="${t.x - TARGET_HW - 3}" y="${t.y - 3}" width="${2 * TARGET_HW + 6}" height="${TARGET_HH + 6}" rx="2" fill="#5a6270" fill-opacity="0.85" stroke="#c9cdd3" stroke-width="1.2" stroke-dasharray="4,2"/>
        <path d="M ${t.x} ${t.y + 4} L ${t.x} ${t.y + 18} M ${t.x - 5} ${t.y + 13} L ${t.x} ${t.y + 19} L ${t.x + 5} ${t.y + 13}" stroke="#e9ebee" stroke-width="1.6" fill="none"/>`)}</g>` + labelAt(39);
  }

  // Papierziel
  const headZone = t.headZone
    ? `<circle cx="${t.x}" cy="${t.y - TARGET_HH - 10}" r="10" fill="${TARGET_TAN}" stroke="${TARGET_STROKE}" stroke-width="1.5"/>`
    : "";
  return `<g>${title}${rot(`${headZone}${paper}`)}</g>` + labelAt(39);
}

// Kleine Symbole für die Werkzeugleiste des Skizzen-Editors
function toolIconSvg(tool) {
  const dim = "#8a92a0";
  const icons = {
    select: `<svg viewBox="0 0 24 24"><path d="M5 3 L19 13 L12 14 L9 21 Z" fill="#e9ebee" stroke="#111" stroke-width="1.2"/></svg>`,
    target: `<svg viewBox="-26 -28 52 56">${targetZonesSvg(0, 0)}</svg>`,
    mini: `<svg viewBox="-26 -28 52 56">${targetZonesSvg(0, 0, MINI_HW, MINI_HH)}</svg>`,
    steel: `<svg viewBox="-15 -15 30 30">${plateSvg(0, 0)}</svg>`,
    popper: `<svg viewBox="-15 -25 30 50">${popperSvg(0, 0)}</svg>`,
    minipopper: `<svg viewBox="-15 -25 30 50"><g transform="scale(0.7)">${popperSvg(0, 0)}</g></svg>`,
    metalns: `<svg viewBox="-15 -15 30 30"><circle r="12" fill="#f5f3ee" stroke="#111" stroke-width="1.5"/></svg>`,
    noshoot: `<svg viewBox="-26 -28 52 56"><polygon points="${shapePoints(TARGET_OUTLINE, 0, 0)}" fill="#f5f3ee" stroke="${ICON_STROKE}" stroke-width="2.5"/></svg>`,
    mover: `<svg viewBox="-30 -28 60 66">${targetZonesSvg(0, 0)}<path d="M-26 32 H26 M-20 27 L-27 32 L-20 37 M20 27 L27 32 L20 37" stroke="${dim}" stroke-width="3" fill="none"/></svg>`,
    dropturner: `<svg viewBox="-26 -28 64 56">${targetZonesSvg(0, 0)}<path d="M27 -16 A16 16 0 0 1 27 16" stroke="${dim}" stroke-width="3" fill="none"/></svg>`,
    clamshell: `<svg viewBox="-26 -28 52 56">${targetZonesSvg(0, 0)}<rect x="-25" y="-3" width="50" height="31" fill="#5a6270" stroke="#c9cdd3" stroke-width="1.5"/></svg>`,
    pendler: `<svg viewBox="-44 -52 88 80"><path d="M-40 -20 A42 42 0 0 1 40 -20" stroke="${dim}" stroke-width="3" fill="none" stroke-dasharray="6,4"/>${targetZonesSvg(0, 0)}</svg>`,
    updown: `<svg viewBox="-26 -28 66 56">${targetZonesSvg(0, 0)}<path d="M32 -14 V14 M27 -8 L32 -15 L37 -8 M27 8 L32 15 L37 8" stroke="${dim}" stroke-width="3" fill="none"/></svg>`,
    shooter: `<svg viewBox="-14 -14 28 28"><polygon points="0,-12 7,10 -7,10" fill="#e8620c"/></svg>`,
    wall: `<svg viewBox="0 0 24 24"><line x1="3" y1="19" x2="21" y2="5" stroke="#c9cdd3" stroke-width="4" stroke-linecap="round"/></svg>`,
    fault: `<svg viewBox="0 0 24 24"><line x1="3" y1="19" x2="21" y2="5" stroke="#d9412b" stroke-width="3.5" stroke-linecap="round"/></svg>`,
    box: `<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" fill="none" stroke="#8a92a0" stroke-width="2" stroke-dasharray="3,2"/></svg>`,
    path: `<svg viewBox="0 0 24 24"><path d="M3 18 L11 10 L21 10" fill="none" stroke="#8a92a0" stroke-width="2" stroke-dasharray="3,2"/><path d="M17 6 L21 10 L17 14" fill="none" stroke="#8a92a0" stroke-width="2"/></svg>`,
    fass: `<svg viewBox="-15 -15 30 30"><circle r="13" fill="#4f5763" stroke="#c9cdd3" stroke-width="2"/><circle r="8" fill="none" stroke="#c9cdd3" stroke-width="1.2"/></svg>`,
    port: `<svg viewBox="-34 -12 68 24"><line x1="-32" y1="0" x2="-11" y2="0" stroke="#c9cdd3" stroke-width="8"/><line x1="11" y1="0" x2="32" y2="0" stroke="#c9cdd3" stroke-width="8"/></svg>`,
    tuer: `<svg viewBox="-24 -44 48 48"><line x1="-20" y1="0" x2="-20" y2="-40" stroke="#c9cdd3" stroke-width="5"/><path d="M20 0 A40 40 0 0 0 -20 -40" fill="none" stroke="#8a92a0" stroke-width="2.5" stroke-dasharray="5,4"/></svg>`,
    tisch: `<svg viewBox="-28 -18 56 36"><rect x="-26" y="-16" width="52" height="32" rx="3" fill="#8a5a3a" stroke="#4a3320" stroke-width="2"/></svg>`,
    sessel: `<svg viewBox="-16 -20 32 34"><rect x="-14" y="-14" width="28" height="26" rx="3" fill="#8a5a3a" stroke="#4a3320" stroke-width="2"/><rect x="-14" y="-18" width="28" height="6" rx="2" fill="#6b4429"/></svg>`,
    text: `<svg viewBox="0 0 24 24"><text x="12" y="18" font-size="18" font-weight="700" text-anchor="middle" fill="#e9ebee" font-family="Segoe UI, sans-serif">T</text></svg>`,
    plan: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e8620c"/><text x="12" y="16.5" font-size="13" font-weight="700" text-anchor="middle" fill="#fff" font-family="Segoe UI, sans-serif">1</text></svg>`,
    delete: `<svg viewBox="0 0 24 24"><path d="M5 7 H19 M9 7 V4 H15 V7 M7 7 L8 20 H16 L17 7" fill="none" stroke="#e05a4a" stroke-width="2"/></svg>`
  };
  return icons[tool] || "";
}

function propEl(p) {
  const label = p.label ? textEl(p.x, p.y + 34, p.label, "#8a92a0", 11) : "";
  const wrap = svg => `<g><title>${escapeXml(PROP_NAMES[p.type] || "")}</title>${rotWrap(svg, p.x, p.y, p.rot)}</g>`;

  if (p.type === "tisch") {
    return wrap(`
        <rect x="${p.x - 26}" y="${p.y - 16}" width="52" height="32" rx="3" fill="#8a5a3a" stroke="#4a3320" stroke-width="2"/>
        <circle cx="${p.x - 20}" cy="${p.y - 10}" r="2" fill="#4a3320"/>
        <circle cx="${p.x + 20}" cy="${p.y - 10}" r="2" fill="#4a3320"/>
        <circle cx="${p.x - 20}" cy="${p.y + 10}" r="2" fill="#4a3320"/>
        <circle cx="${p.x + 20}" cy="${p.y + 10}" r="2" fill="#4a3320"/>`) + label;
  }
  if (p.type === "sessel") {
    return wrap(`
        <rect x="${p.x - 14}" y="${p.y - 14}" width="28" height="26" rx="3" fill="#8a5a3a" stroke="#4a3320" stroke-width="2"/>
        <rect x="${p.x - 14}" y="${p.y - 18}" width="28" height="6" rx="2" fill="#6b4429" stroke="#4a3320" stroke-width="1.5"/>`) + label;
  }
  if (p.type === "fass") {
    // Fass von oben
    return wrap(`
        <circle cx="${p.x}" cy="${p.y}" r="13" fill="#4f5763" stroke="#c9cdd3" stroke-width="2"/>
        <circle cx="${p.x}" cy="${p.y}" r="8" fill="none" stroke="#c9cdd3" stroke-width="1.2"/>`) + label;
  }
  if (p.type === "port") {
    // Port: Wandstück mit Öffnung
    return wrap(`
        <line x1="${p.x - 32}" y1="${p.y}" x2="${p.x - 11}" y2="${p.y}" stroke="#c9cdd3" stroke-width="8" stroke-linecap="butt"/>
        <line x1="${p.x + 11}" y1="${p.y}" x2="${p.x + 32}" y2="${p.y}" stroke="#c9cdd3" stroke-width="8" stroke-linecap="butt"/>
        <rect x="${p.x - 11}" y="${p.y - 4}" width="22" height="8" fill="none" stroke="#7fb0e8" stroke-width="1.5" stroke-dasharray="3,2"/>`) + label;
  }
  if (p.type === "tuer") {
    // Tür: Türblatt am Scharnier und Öffnungsbogen
    return wrap(`
        <line x1="${p.x - 20}" y1="${p.y}" x2="${p.x + 20}" y2="${p.y}" stroke="#5a6270" stroke-width="2" stroke-dasharray="3,3"/>
        <line x1="${p.x - 20}" y1="${p.y}" x2="${p.x - 20}" y2="${p.y - 40}" stroke="#c9cdd3" stroke-width="4" stroke-linecap="round"/>
        <path d="M ${p.x + 20} ${p.y} A 40 40 0 0 0 ${p.x - 20} ${p.y - 40}" fill="none" stroke="#8a92a0" stroke-width="1.5" stroke-dasharray="4,3"/>`) + label;
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
