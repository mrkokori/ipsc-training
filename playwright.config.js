// Konfiguration für den Browser-Smoke-Test (tests/smoke.spec.js).
// Läuft in echtem Chromium, weil jsdom (tests/run-tests.js) kein CSP prüft und
// solche Fehler deshalb strukturell nicht finden kann – siehe smoke.spec.js.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: "smoke.spec.js",
  timeout: 30000,
  webServer: {
    command: "node tests/static-server.js",
    port: 8787,
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: "http://localhost:8787"
  }
});
