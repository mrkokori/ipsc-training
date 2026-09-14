let DRILLS = [];
let customDrills = [];
let editedBuiltins = {};
let deletedBuiltinIds = [];
let scoreLogs = {};

const CUSTOM_STORAGE_KEY = "ipscCustomDrills";
const EDITED_BUILTINS_KEY = "ipscEditedBuiltins";
const DELETED_BUILTINS_KEY = "ipscDeletedBuiltins";
const SCORE_LOG_KEY = "ipscScoreLogs";

const state = { category: "", difficulty: "", equipment: "" };

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
const importBtn = document.getElementById("import-btn");
const importFileInput = document.getElementById("import-file-input");
const dbToolsMsg = document.getElementById("db-tools-msg");

function emptyBuilderLayout() {
  return { viewW: 400, viewH: 500, targets: [], shooterPositions: [], walls: [], boxes: [], props: [], path: [] };
}

let builderLayout = emptyBuilderLayout();
let builderTool = "target";
let pendingPoint = null;
let pathBuffer = [];
let historyStack = [];
let dragState = null;
let pointerDownPoint = null;
let didDrag = false;

let editingDrillId = null;
let editingIsCustom = false;
let equipmentSelected = new Set();

const TOOL_HINTS = {
  target: "Klicke in die Fläche, um ein Ziel zu platzieren.",
  steel: "Klicke in die Fläche, um eine Stahlplatte zu platzieren.",
  popper: "Klicke in die Fläche, um einen Popper zu platzieren.",
  pendler: "Klicke, um einen Pendler (Swinger) zu platzieren.",
  updown: "Klicke, um ein Up-Down-Ziel zu platzieren.",
  noshoot: "Klicke in die Fläche, um ein No-Shoot-Ziel zu platzieren.",
  shooter: "Klicke, um eine Schützenposition zu platzieren. Mit \"Schütze drehen\" die Blickrichtung ändern.",
  wall: "Erster Klick = Anfang der Wand, zweiter Klick = Ende der Wand.",
  box: "Erster Klick = eine Ecke der Box, zweiter Klick = gegenüberliegende Ecke.",
  tisch: "Klicke, um einen Tisch zu platzieren.",
  sessel: "Klicke, um einen Sessel zu platzieren.",
  path: "Jeder Klick fügt einen Punkt zum Bewegungspfad hinzu. Mit \"Pfad abschließen\" übernehmen.",
  delete: "Klicke auf ein Element, um es zu löschen."
};
const DRAG_HINT = " Bereits gesetzte Elemente kannst du direkt anfassen und verschieben.";

init();

async function init() {
  customDrills = loadJSON(CUSTOM_STORAGE_KEY, []);
  editedBuiltins = loadJSON(EDITED_BUILTINS_KEY, {});
  deletedBuiltinIds = loadJSON(DELETED_BUILTINS_KEY, []);
  scoreLogs = loadJSON(SCORE_LOG_KEY, {});
  mergeDrills();
  populateFilters();
  updateRestoreButton();
  render();

  catSelect.addEventListener("change", () => { state.category = catSelect.value; render(); });
  diffSelect.addEventListener("change", () => { state.difficulty = diffSelect.value; render(); });
  equipSelect.addEventListener("change", () => { state.equipment = equipSelect.value; render(); });
  resetBtn.addEventListener("click", () => {
    state.category = ""; state.difficulty = ""; state.equipment = "";
    catSelect.value = ""; diffSelect.value = ""; equipSelect.value = "";
    render();
  });
  closeBtn.addEventListener("click", closeDetail);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeDetail(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeDetail(); closeCreate(); }
  });

  addDrillBtn.addEventListener("click", openCreate);
  createClose.addEventListener("click", closeCreate);
  createCancel.addEventListener("click", closeCreate);
  createOverlay.addEventListener("click", (e) => { if (e.target === createOverlay) closeCreate(); });
  createForm.addEventListener("submit", handleCreateSubmit);

  restoreBuiltinsBtn.addEventListener("click", restoreBuiltins);
  exportBtn.addEventListener("click", exportAll);
  importBtn.addEventListener("click", () => importFileInput.click());
  importFileInput.addEventListener("change", () => {
    if (importFileInput.files[0]) importFile(importFileInput.files[0]);
    importFileInput.value = "";
  });

  initBuilder();
  initEquipmentMultiselect();
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
  return DRILLS.filter(d => {
    if (state.category && d.category !== state.category) return false;
    if (state.difficulty && d.difficulty !== state.difficulty) return false;
    if (state.equipment && !(d.equipment || []).includes(state.equipment)) return false;
    return true;
  });
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
      : "Keine Trainings gefunden. Filter zurücksetzen und erneut versuchen.";
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
  card.innerHTML = `
    <h3>${escapeHtml(drill.title)}</h3>
    <div class="drill-meta">
      <span class="badge">${escapeHtml(drill.category)}</span>
      ${drill.difficulty ? `<span class="badge difficulty">${escapeHtml(drill.difficulty)}</span>` : ""}
      ${drill.custom ? `<span class="badge custom">Eigenes</span>` : ""}
      ${drill.builtinEdited ? `<span class="badge builtin-edited">Bearbeitet</span>` : ""}
    </div>
    <div class="drill-stats">
      <span>${drill.rounds ? drill.rounds + " Schuss" : ""}</span>
      <span>${escapeHtml(drill.distance || "")}</span>
    </div>
  `;
  card.addEventListener("click", () => openDetail(drill));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter") openDetail(drill); });
  return card;
}

function openDetail(drill) {
  const sketchHtml = drill.sketchDataUrl
    ? `<div class="sketch-img-wrap"><img src="${drill.sketchDataUrl}" alt="Stage-Skizze"></div>`
    : `<div class="layout-svg-wrap">${renderLayout(drill.layout || {})}</div>`;

  detailContent.innerHTML = `
    <h2>${escapeHtml(drill.title)}</h2>
    <div class="drill-meta">
      <span class="badge">${escapeHtml(drill.category)}</span>
      ${drill.difficulty ? `<span class="badge difficulty">${escapeHtml(drill.difficulty)}</span>` : ""}
      ${(drill.equipment || []).map(e => `<span class="badge difficulty">${escapeHtml(e)}</span>`).join("")}
      ${drill.custom ? `<span class="badge custom">Eigenes</span>` : ""}
      ${drill.builtinEdited ? `<span class="badge builtin-edited">Bearbeitet</span>` : ""}
    </div>

    <div class="detail-grid">
      <div class="stat-box"><div class="label">Schusszahl</div><div class="value">${drill.rounds || "–"}</div></div>
      <div class="stat-box"><div class="label">Distanz</div><div class="value">${escapeHtml(drill.distance || "–")}</div></div>
      <div class="stat-box"><div class="label">Par-Zeit / Ziel</div><div class="value">${escapeHtml(drill.parTime || "–")}</div></div>
      <div class="stat-box"><div class="label">Fokus</div><div class="value">${escapeHtml(drill.focus || "–")}</div></div>
      ${drill.courseType ? `<div class="stat-box"><div class="label">Kursart (IPSC)</div><div class="value">${escapeHtml(drill.courseType)}</div></div>` : ""}
    </div>

    <div class="section-title">Stage-Skizze</div>
    ${sketchHtml}

    <div class="section-title">Ablauf</div>
    <div class="procedure-text">${escapeHtml(drill.procedure || "")}</div>

    <div class="section-title">Eigene Ergebnisse &amp; Hit-Factor</div>
    <div id="score-section"></div>

    <div id="action-row" class="db-tools">
      <button type="button" class="edit-btn" id="edit-drill-btn">Bearbeiten</button>
      <button type="button" class="tool-btn" id="share-drill-btn">Teilen</button>
      <button type="button" class="delete-btn" id="delete-drill-btn">Löschen</button>
    </div>
  `;
  overlay.classList.remove("hidden");
  lockBodyScroll();

  refreshScoreSection(drill);

  document.getElementById("edit-drill-btn").addEventListener("click", () => {
    closeDetail();
    openEdit(drill);
  });
  document.getElementById("share-drill-btn").addEventListener("click", () => shareDrill(drill));

  const attachDeleteHandler = () => {
    document.getElementById("delete-drill-btn").addEventListener("click", showDeleteConfirm);
  };
  const showDeleteConfirm = () => {
    const row = document.getElementById("action-row");
    row.innerHTML = `
      <span class="confirm-text">"${escapeHtml(drill.title)}" wirklich löschen?</span>
      <button type="button" class="delete-btn confirm-yes" id="confirm-delete-yes">Ja, löschen</button>
      <button type="button" class="tool-btn" id="confirm-delete-no">Abbrechen</button>
    `;
    document.getElementById("confirm-delete-yes").addEventListener("click", () => {
      deleteDrill(drill);
      closeDetail();
    });
    document.getElementById("confirm-delete-no").addEventListener("click", () => {
      row.innerHTML = `
        <button type="button" class="edit-btn" id="edit-drill-btn">Bearbeiten</button>
        <button type="button" class="tool-btn" id="share-drill-btn">Teilen</button>
        <button type="button" class="delete-btn" id="delete-drill-btn">Löschen</button>
      `;
      document.getElementById("edit-drill-btn").addEventListener("click", () => { closeDetail(); openEdit(drill); });
      document.getElementById("share-drill-btn").addEventListener("click", () => shareDrill(drill));
      attachDeleteHandler();
    });
  };
  attachDeleteHandler();
}

function closeDetail() {
  overlay.classList.add("hidden");
  unlockBodyScroll();
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

function calcIpscPoints(alpha, charlie, delta, noshoot, major) {
  const raw = major
    ? alpha * 5 + charlie * 4 + delta * 2
    : alpha * 5 + charlie * 3 + delta * 1;
  return raw - noshoot * 10;
}

function drillHasNoShoot(drill) {
  return !!(drill.layout && drill.layout.targets && drill.layout.targets.some(t => t.type === "noshoot"));
}

function addScoreEntry(drillId, alpha, charlie, delta, mike, noshoot, time, major) {
  const points = calcIpscPoints(alpha, charlie, delta, noshoot, major);
  const hitFactor = time > 0 ? Math.round((points / time) * 10000) / 10000 : 0;
  const entry = { date: new Date().toISOString(), alpha, charlie, delta, mike, noshoot, time, major, points, hitFactor };
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

function sparklineSvg(values) {
  const w = 320, h = 56, pad = 6;
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const line = pts.map(p => p.join(",")).join(" ");
  const dots = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="#e8620c"/>`).join("");
  return `
  <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
    <rect x="0" y="0" width="${w}" height="${h}" fill="#0b0d10" rx="6"/>
    <polyline points="${line}" fill="none" stroke="#e8620c" stroke-width="2"/>
    ${dots}
  </svg>`;
}

function refreshScoreSection(drill) {
  const container = document.getElementById("score-section");
  if (!container) return;
  const log = getScoreLog(drill.id);
  const hasNoShoot = drillHasNoShoot(drill);

  const sparkline = log.length >= 2
    ? `<div class="score-sparkline-wrap">${sparklineSvg(log.map(e => e.hitFactor))}</div>`
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
      <thead><tr><th>Datum</th><th>A</th><th>C</th><th>D</th><th>M</th>${hasNoShoot ? "<th>NS</th>" : ""}<th>Punkte</th><th>Zeit</th><th>Hit-Factor</th><th>Trend</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>` : `<p class="score-empty">Noch keine Versuche eingetragen.</p>`;

  container.innerHTML = `
    ${sparkline}
    ${table}
    <div class="score-form">
      <label class="score-field"><span>Alpha</span><input type="number" id="score-alpha" step="1" min="0" value="0"></label>
      <label class="score-field"><span>Charlie</span><input type="number" id="score-charlie" step="1" min="0" value="0"></label>
      <label class="score-field"><span>Delta</span><input type="number" id="score-delta" step="1" min="0" value="0"></label>
      <label class="score-field"><span>Mike</span><input type="number" id="score-mike" step="1" min="0" value="0"></label>
      ${hasNoShoot ? `<label class="score-field"><span>No-Shoot</span><input type="number" id="score-noshoot" step="1" min="0" value="0"></label>` : ""}
      <label class="score-field"><span>Zeit (Sekunden)</span><input type="number" id="score-time" step="0.01" min="0.01"></label>
      <label class="score-field">
        <span>Power Factor</span>
        <select id="score-major">
          <option value="0" selected>Minor</option>
          <option value="1">Major</option>
        </select>
      </label>
      <button type="button" class="tool-btn" id="score-add-btn">Eintragen</button>
      <span class="score-result" id="score-live-result"></span>
    </div>
  `;

  const alphaInput = document.getElementById("score-alpha");
  const charlieInput = document.getElementById("score-charlie");
  const deltaInput = document.getElementById("score-delta");
  const mikeInput = document.getElementById("score-mike");
  const noshootInput = hasNoShoot ? document.getElementById("score-noshoot") : null;
  const timeInput = document.getElementById("score-time");
  const majorSelect = document.getElementById("score-major");
  const liveResult = document.getElementById("score-live-result");

  const updateLive = () => {
    const a = parseInt(alphaInput.value, 10) || 0;
    const c = parseInt(charlieInput.value, 10) || 0;
    const d = parseInt(deltaInput.value, 10) || 0;
    const ns = noshootInput ? (parseInt(noshootInput.value, 10) || 0) : 0;
    const t = parseFloat(timeInput.value);
    const pts = calcIpscPoints(a, c, d, ns, majorSelect.value === "1");
    if (t > 0) {
      liveResult.innerHTML = `${pts} Punkte – Hit-Factor: <strong>${(pts / t).toFixed(4)}</strong>`;
    } else {
      liveResult.textContent = pts !== 0 ? `${pts} Punkte – Zeit fehlt` : "";
    }
  };
  [alphaInput, charlieInput, deltaInput, mikeInput, timeInput].forEach(el => el.addEventListener("input", updateLive));
  if (noshootInput) noshootInput.addEventListener("input", updateLive);
  majorSelect.addEventListener("change", updateLive);

  document.getElementById("score-add-btn").addEventListener("click", () => {
    const a = parseInt(alphaInput.value, 10) || 0;
    const c = parseInt(charlieInput.value, 10) || 0;
    const d = parseInt(deltaInput.value, 10) || 0;
    const m = parseInt(mikeInput.value, 10) || 0;
    const ns = noshootInput ? (parseInt(noshootInput.value, 10) || 0) : 0;
    const t = parseFloat(timeInput.value);
    if (!(a + c + d + m + ns > 0) || !(t > 0)) { alert("Bitte mindestens einen Treffer/Fehlschuss (A/C/D/M/NS) und eine Zeit (> 0 Sekunden) angeben."); return; }
    addScoreEntry(drill.id, a, c, d, m, ns, t, majorSelect.value === "1");
    refreshScoreSection(drill);
  });

  container.querySelectorAll(".score-del-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      deleteScoreEntry(drill.id, parseInt(btn.dataset.idx, 10));
      refreshScoreSection(drill);
    });
  });
}

// ---------- Create / edit / delete drills ----------

function deleteDrill(drill) {
  if (drill.custom) {
    customDrills = customDrills.filter(d => d.id !== drill.id);
    saveCustomDrills();
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
  pathBuffer = [];
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
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "training";
}

function exportAll() {
  const payload = {
    type: "ipsc-training-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    customDrills,
    editedBuiltins,
    deletedBuiltinIds
  };
  downloadJSON(JSON.stringify(payload, null, 2), "ipsc-training-export.json");
  showDbMsg("Export heruntergeladen – Datei an Kollegen weitergeben, die können sie importieren.");
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
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      if (data.type === "ipsc-training-export") {
        const incoming = data.customDrills || [];
        const existingIds = new Set(customDrills.map(d => d.id));
        for (const d of incoming) {
          const clone = { ...d, custom: true };
          if (!clone.id || existingIds.has(clone.id)) {
            clone.id = "custom-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
          }
          existingIds.add(clone.id);
          customDrills.push(clone);
        }
        editedBuiltins = { ...editedBuiltins, ...(data.editedBuiltins || {}) };
        deletedBuiltinIds = [...new Set([...deletedBuiltinIds, ...(data.deletedBuiltinIds || [])])];
        saveCustomDrills();
        saveEditedBuiltins();
        saveDeletedBuiltins();
        showDbMsg(`${incoming.length} Training(s) importiert.`);
      } else if (data.type === "ipsc-training-drill" && data.drill) {
        const clone = { ...data.drill, custom: true, id: "custom-" + Date.now() };
        customDrills.push(clone);
        saveCustomDrills();
        showDbMsg(`"${clone.title}" importiert.`);
      } else {
        alert("Unbekanntes Dateiformat – das ist keine IPSC-Trainings-Export-Datei.");
        return;
      }

      mergeDrills();
      populateFilters();
      updateRestoreButton();
      render();
    } catch (e) {
      alert("Import fehlgeschlagen: Datei ist kein gültiges Trainings-Export-Format.");
    }
  };
  reader.readAsText(file);
}

// ---------- Stage builder (click-to-place + drag-to-move, same renderer as built-in drills) ----------

function resetBuilder() {
  builderLayout = emptyBuilderLayout();
  pendingPoint = null;
  pathBuffer = [];
  historyStack = [];
  renderBuilderPreview();
}

function initBuilder() {
  if (!builderSvg) return;

  document.querySelectorAll(".tool-select").forEach(btn => {
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

  document.getElementById("finish-path-btn").addEventListener("click", () => {
    if (pathBuffer.length < 2) return;
    historyStack.push({ type: "path", prevValue: builderLayout.path.slice() });
    builderLayout.path = pathBuffer.slice();
    pathBuffer = [];
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
  } else if (builderTool === "path") {
    pathBuffer.push([p.x, p.y]);
  }

  renderBuilderPreview();
}

function undoBuilder() {
  const last = historyStack.pop();
  if (!last) return;
  if (last.type === "path") {
    builderLayout.path = last.prevValue;
  } else {
    builderLayout[last.type].pop();
  }
  renderBuilderPreview();
}

function renderBuilderPreview() {
  if (!builderSvg) return;
  let extra = "";

  if (pendingPoint) {
    extra += `<circle cx="${pendingPoint.x}" cy="${pendingPoint.y}" r="5" fill="none" stroke="#e8620c" stroke-width="2" stroke-dasharray="3,2"/>`;
  }
  if (pathBuffer.length > 0) {
    const pts = pathBuffer.map(p => p.join(",")).join(" ");
    extra += `<polyline points="${pts}" fill="none" stroke="#e8620c" stroke-width="2" stroke-dasharray="4,3"/>`;
    for (const [px, py] of pathBuffer) {
      extra += `<circle cx="${px}" cy="${py}" r="3" fill="#e8620c"/>`;
    }
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

function ipscTargetOctagon(cx, cy, hw, hh, chamfer) {
  const pts = [
    [cx - hw + chamfer, cy - hh], [cx + hw - chamfer, cy - hh],
    [cx + hw, cy - hh + chamfer], [cx + hw, cy + hh - chamfer],
    [cx + hw - chamfer, cy + hh], [cx - hw + chamfer, cy + hh],
    [cx - hw, cy + hh - chamfer], [cx - hw, cy - hh + chamfer]
  ];
  return pts.map(p => p.join(",")).join(" ");
}

// Real IPSC target look: tan silhouette with nested A/C-zone outlines
const TARGET_TAN = "#d9b98a";
const TARGET_STROKE = "#4a2f18";
const CLUB_CYAN = "#00cdff";
const ICON_STROKE = "#000";

function ipscInnerZone(cx, cy, hw, hh, chamfer) {
  // A/C-zone outline: flat chamfered top, straight sides, converging to a point at the bottom
  const pts = [
    [cx - hw + chamfer, cy - hh], [cx + hw - chamfer, cy - hh],
    [cx + hw, cy - hh + chamfer], [cx + hw, cy + hh * 0.35],
    [cx, cy + hh], [cx - hw, cy + hh * 0.35],
    [cx - hw, cy - hh + chamfer]
  ];
  return pts.map(p => p.join(",")).join(" ");
}

function targetZonesSvg(cx, cy) {
  // outer silhouette + two nested zone outlines (C-zone, A-zone) — matches the
  // real IPSC target diagram look
  const bodyPts = ipscTargetOctagon(cx, cy, 20, 32, 8);
  const cZonePts = ipscInnerZone(cx, cy - 3, 14, 27, 6);
  const aZonePts = ipscInnerZone(cx, cy - 5, 8, 20, 4);
  return `
    <polygon points="${bodyPts}" fill="${TARGET_TAN}" stroke="${TARGET_STROKE}" stroke-width="2"/>
    <polygon points="${cZonePts}" fill="none" stroke="${TARGET_STROKE}" stroke-width="1.3"/>
    <polygon points="${aZonePts}" fill="none" stroke="${TARGET_STROKE}" stroke-width="1.3"/>`;
}

function targetEl(t) {
  const label = textEl(t.x, t.y + 42, t.label, "#8a92a0", 11);

  if (t.type === "steel") {
    // stagebook "plate" icon: plain cyan disc
    return `<circle cx="${t.x}" cy="${t.y}" r="16" fill="${CLUB_CYAN}" stroke="${ICON_STROKE}" stroke-width="2"/>` + label;
  }

  if (t.type === "popper") {
    // stagebook "popper" icon: keyhole shape (round head, tapered body, flat rounded base)
    return `
      <path d="M ${t.x - 13} ${t.y - 8}
               A 13 13 0 1 1 ${t.x + 13} ${t.y - 8}
               L ${t.x + 12} ${t.y + 26}
               Q ${t.x + 12} ${t.y + 32} ${t.x + 6} ${t.y + 32}
               L ${t.x - 6} ${t.y + 32}
               Q ${t.x - 12} ${t.y + 32} ${t.x - 12} ${t.y + 26}
               Z"
            fill="${CLUB_CYAN}" stroke="${ICON_STROKE}" stroke-width="2"/>` + label;
  }

  if (t.type === "noshoot") {
    // stagebook convention: a No-Shoot is the same target silhouette, plain white, no scoring zone
    const pts = ipscTargetOctagon(t.x, t.y, 20, 32, 8);
    return `<polygon points="${pts}" fill="#f5f3ee" stroke="${ICON_STROKE}" stroke-width="2"/>` + label;
  }

  if (t.type === "pendler") {
    // swinger: standard target icon plus a dashed swing arc with motion arrows
    const armY = t.y - 34;
    return `
      <g>
        <path d="M ${t.x - 40} ${armY + 14} A 42 42 0 0 1 ${t.x + 40} ${armY + 14}" fill="none" stroke="#8a92a0" stroke-width="1.5" stroke-dasharray="4,3"/>
        <circle cx="${t.x - 40}" cy="${armY + 14}" r="2.5" fill="#8a92a0"/>
        <circle cx="${t.x + 40}" cy="${armY + 14}" r="2.5" fill="#8a92a0"/>
        <line x1="${t.x}" y1="${armY - 20}" x2="${t.x}" y2="${t.y - 32}" stroke="#5a6270" stroke-width="2"/>
        ${targetZonesSvg(t.x, t.y)}
      </g>` + label;
  }

  if (t.type === "updown") {
    // up-down (drop) target: standard target icon plus an up/down arrow badge
    const ax = t.x + 26, ay = t.y - 4;
    return `
      <g>
        ${targetZonesSvg(t.x, t.y)}
        <g stroke="#8a92a0" stroke-width="2" fill="none">
          <line x1="${ax}" y1="${ay - 14}" x2="${ax}" y2="${ay + 14}"/>
          <path d="M ${ax - 4} ${ay - 9} L ${ax} ${ay - 15} L ${ax + 4} ${ay - 9}"/>
          <path d="M ${ax - 4} ${ay + 9} L ${ax} ${ay + 15} L ${ax + 4} ${ay + 9}"/>
        </g>
      </g>` + label;
  }

  // real IPSC target: chamfered tan octagon with nested C-zone and A-zone outlines
  let headZone = "";
  if (t.headZone) {
    headZone = `<circle cx="${t.x}" cy="${t.y - 40}" r="11" fill="${TARGET_TAN}" stroke="${TARGET_STROKE}" stroke-width="1.5"/>`;
  }
  return `
    <g>
      ${headZone}
      ${targetZonesSvg(t.x, t.y)}
    </g>` + label;
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
