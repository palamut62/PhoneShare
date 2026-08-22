/**
 * PhoneShare Service Worker (PRD §11).
 *
 * Kurallar:
 * - `/api/*` istekleri **asla** onbellege alinmaz; her zaman ag uzerinden gider.
 * - Uygulama kabugu (app shell) onceden onbellege alinir, gezinmede fallback olarak kullanilir.
 * - Surum degisince eski onbellekler silinir.
 */

const VERSION = "v4";
const SHELL_CACHE = `phoneshare-shell-${VERSION}`;
const ASSET_CACHE = `phoneshare-assets-${VERSION}`;

const SHELL_URLS = [
  "/",
  "/transfers/",
  "/settings/",
  "/files/",
  "/stats/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => Promise.allSettled(SHELL_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API ve WebSocket trafigi hicbir kosulda onbellege alinmaz.
  if (url.pathname.startsWith("/api/")) return;

  // Gezinme: once ag, basarisizsa onbellekteki kabuk.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(request)) || (await cache.match("/")) || Response.error();
        }),
    );
    return;
  }

  // Hash'li statik varliklar: once onbellek, sonra ag.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Diger istekler: once ag, cevrimdisi kalinirsa onbellek.
  event.respondWith(fetch(request).catch(() => caches.match(request).then((cached) => cached || Response.error())));
});
