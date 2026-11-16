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

/* ---------- web push (js/push.js přihlásí odběr, posílá supabase/functions/_shared/push.ts) ----------
   Payload: { title, body, url, tag, kind }. Nic se tu necachuje — jen se zobrazí upozornění
   a po klepnutí se otevře / zaostří dashboard na správné sekci. */
const PUSH_ICON = "assets/icons/icon-192.png";
const PUSH_VIEWS = { results: "vykon", matches: "sazeni", limit: "prehled" };

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(data.title || "Fundly", {
    body: data.body || "",
    icon: PUSH_ICON,
    badge: PUSH_ICON,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "", kind: data.kind || "" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const view = PUSH_VIEWS[d.kind] || String(d.url || "").split("#")[1] || "prehled";
  const target = new URL("dashboard#" + view, self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // otevřený dashboard: zaostřit a přepnout sekci bez načtení stránky (poslouchá js/push.js)
    const dash = wins.find((w) => /\/dashboard(\.html)?$/.test(new URL(w.url).pathname));
    if (dash) {
      dash.postMessage({ type: "fundly:push-open", view });
      return dash.focus();
    }
    return self.clients.openWindow(target);
  })());
});
