/* Fundly service worker — makes the site installable ("Add to Home Screen") and shows a
   friendly page when the phone is offline. It deliberately caches NOTHING else: pages,
   scripts and API calls always come from the network, so a new deploy (?v= cache-bust) is
   never held back by an old cached copy and a player never sees stale balances. */
const VERSION = "fundly-sw-1";
const OFFLINE_URL = "offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate") return; // everything except page navigations goes straight to the network
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
});
