// service-worker.js
const VERSION = "v2026-02-26-01-001"; // <-- ganti tiap deploy
const CACHE_NAME = `padel-cache-${VERSION}`;

const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  "/styles.css", // kalau file ini ada
  // tambahin icon kalau ada:
  // "/icons/icon-192.png",
  // "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  // HTML: network-first supaya update cepat
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch (e) {
          const cached = await caches.match(req);
          return cached || caches.match("/index.html");
        }
      })()
    );
    return;
  }

  // Others: cache-first (fast)
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone());
      return fresh;
    })()
  );
});