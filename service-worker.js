// service-worker.js
const VERSION = "v1.6.15";
const CACHE_NAME = `padel-cache-${VERSION}`;
const STYLES_URL = "/styles.css?v=1.6.15";

const URLS_TO_CACHE = [
  "/",
  "/index.html",
  "/manifest.json",
  STYLES_URL,
  "/js/script.js",
  "/js/americano-round-planner.js",
  "/js/americano-schedule-generator.js",
  "/js/mix-americano-schedule-generator.js",
  "/js/version.js",
  "/js/theme.js",
  "/js/tailwind-padelio-config.js",
];

function isHtmlRequest(req) {
  const accept = req.headers.get("accept") || "";
  return req.mode === "navigate" || accept.includes("text/html");
}

function isFreshAssetRequest(url) {
  if (url.pathname.endsWith(".css")) return true;
  if (url.pathname.endsWith(".js") && url.pathname.startsWith("/js/")) return true;
  return false;
}

/** Network-first: always try latest CSS/JS (fixes stale design after deploy). */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    if (fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

/** Cache-first for icons/images only. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

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
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isHtmlRequest(req)) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req, { cache: "no-store" });
          const cache = await caches.open(CACHE_NAME);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return (await caches.match(req)) || (await caches.match("/index.html"));
        }
      })()
    );
    return;
  }

  if (isFreshAssetRequest(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});
