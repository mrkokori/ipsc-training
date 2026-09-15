// Offline cache for the IPSC Trainings-Bibliothek PWA.
// Strategie: zuerst das Netz (damit Updates sofort ankommen), bei fehlendem
// oder zu langsamem Netz die Version aus dem Cache. Nach dem ersten Öffnen
// funktioniert die App damit auch ohne Empfang am Schießstand.
const CACHE_NAME = "ipsc-training-v3";
const NETWORK_TIMEOUT_MS = 3000;
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "data/drills.js",
  "manifest.json",
  "icon-192.png",
  "icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: true });

    const network = fetch(request).then((response) => {
      // Nur erfolgreiche Antworten der eigenen Seite cachen – keine 404/500
      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    });

    if (!cached) {
      try {
        return await network;
      } catch (e) {
        if (request.mode === "navigate") {
          const fallback = await cache.match("index.html");
          if (fallback) return fallback;
        }
        return new Response("Offline – diese Datei ist nicht im Cache.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    }

    // Es gibt eine Cache-Version: kurz auf das Netz warten, sonst Cache liefern.
    // Das Netz-Update läuft im Hintergrund weiter und landet im Cache.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
    return Promise.race([network.catch(() => cached), timeout]);
  })());
});
