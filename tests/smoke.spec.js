// Browser-Smoke-Test: lädt die App in echtem Chromium und klickt durch die
// Hauptansichten. Ergänzt tests/run-tests.js (node/jsdom), weil jsdom kein CSP
// durchsetzt und deshalb z.B. die style="…"-Attribute nicht als Fehler meldet,
// die die Content-Security-Policy in echten Browsern blockiert (siehe Git-Log:
// "Add a cross-drill Statistik dashboard; fix CSP-blocked bar charts"). Seedet
// deshalb bewusst Daten, damit auch die Balkendiagramme (Statistik, Match-
// Auswertung) tatsächlich gerendert werden und nicht nur ihre leeren Zustände.
const { test, expect } = require("@playwright/test");

const SEED = {
  ipscScoreLogs: {
    "std-el-presidente": [
      { date: "2026-06-01T10:00:00.000Z", alpha: 8, charlie: 2, delta: 0, mike: 0, noshoot: 0, procedural: 0, time: 6, major: false, points: 46, hitFactor: 7.6 }
    ]
  },
  ipscSessions: [
    { id: "s1", date: "2026-06-01", type: "live", location: "Verein", rounds: 50, minutes: 60, drillIds: ["std-el-presidente"], notes: "" }
  ],
  ipscMatches: [
    {
      id: "m1", name: "Vienna Open", date: "2026-06-01", division: "", major: false, notes: "",
      stages: [{ id: "st1", name: "Stage 1", alpha: 8, charlie: 2, delta: 0, mike: 1, noshoot: 0, procedural: 0, time: 6, maxPoints: 0, winnerHF: 10 }]
    }
  ]
};

test("App lädt und alle Hauptansichten öffnen ohne Konsolen-/CSP-Fehler", async ({ page }) => {
  const errors = [];
  // Fehlgeschlagene Ressourcen meldet Chromium auch als generische Konsolenfehler
  // ohne URL im Text ("Failed to load resource: …") – die werden hier ignoriert,
  // weil der response-Handler unten (mit korrekter URL) dieselben Fälle präziser
  // abdeckt. favicon.ico fragt der Browser automatisch an, die App liefert keins
  // (nutzt icon-192/512.png über das Manifest) – kein echter Fehler.
  page.on("console", (m) => {
    if (m.type() === "error" && !/^Failed to load resource:/.test(m.text())) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(`${r.status()} ${r.url()}`);
  });

  await page.addInitScript((seed) => {
    for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, JSON.stringify(value));
  }, SEED);
  // window.print() öffnet in echten Browsern einen blockierenden System-Dialog,
  // der im headless-Lauf nie geschlossen würde - stattdessen nur mitzählen.
  let printCalls = 0;
  await page.exposeFunction("__countPrint", () => { printCalls++; });
  await page.addInitScript(() => { window.print = () => window.__countPrint(); });

  await page.goto("/index.html");
  await expect(page.locator("#drill-grid > *").first()).toBeVisible();

  const overlays = [
    ["#journal-btn", "#journal-close"],
    // Trainingsplan-Liste zeigt pro Eintrag einen Fortschrittsbalken (plan-progress)
    ["#plans-btn", "#plans-close"],
    ["#stats-btn", "#stats-close"],
    ["#share-multi-btn", "#multishare-close"],
    ["#settings-btn", "#settings-close"]
  ];
  for (const [openSelector, closeSelector] of overlays) {
    await page.click(openSelector);
    await expect(page.locator(closeSelector)).toBeVisible();
    await page.click(closeSelector);
  }

  // Druckvorlage: printTargets() weist #print-sheet früher über ein per JS
  // eingefügtes <style>-Element ein Seitenformat zu, was style-src 'self' blockiert
  // hätte - jetzt über eine Klasse + benannte @page-Regel in style.css (siehe
  // Git-Log). Die Standardwerte im Formular passen schon direkt auf A4.
  await page.click("#print-targets-btn");
  await expect(page.locator("#p-print")).toBeEnabled();
  await page.click("#p-print");
  await expect(page.locator("#print-sheet")).toHaveClass(/a4-(portrait|landscape)/);
  expect(printCalls).toBe(1);
  await page.click("#print-close");

  // Match-Auswertung: eigene Ansicht, weil ihre Punktverlust-Balken (loss-bars)
  // erst nach dem Öffnen eines konkreten Matches gerendert werden.
  await page.click("#matches-btn");
  await page.click("#match-content .journal-item");
  await expect(page.locator(".loss-bar").first()).toBeVisible();
  await page.click("#match-close");

  // Stage-Editor: separat, weil er über den Anlegen-Dialog geöffnet wird
  await page.click("#add-drill-btn");
  await expect(page.locator("#create-overlay")).toBeVisible();
  await page.click("#create-close");

  // Detailansicht einer Übung (SVG-Skizze, Ergebnis-Formular)
  await page.click("#drill-grid .drill-card >> nth=0");
  await expect(page.locator("#detail-content")).toBeVisible();
  await page.click("#detail-close");

  expect(errors, `Konsolen-/CSP-Fehler:\n${errors.join("\n")}`).toEqual([]);
});
