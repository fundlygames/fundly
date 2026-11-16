/* Fundly — upozornění na telefon (web push).
 *
 * Co hráč dostane (posílají edge funkce, viz supabase/functions/_shared/push.ts):
 *   results — "Tvůj tip vyšel 🎉" / "Tip nevyšel", když tip vyhodnotí server (settle-tickets)
 *   matches — "Sledovaný zápas začíná za 15 min" pro zápasy s hvězdičkou (push-dispatch)
 *   limit   — "Jsi blízko denního limitu ztráty" (settle-tickets, max. 1× za účet a UTC den)
 *
 * UX pravidla: o povolení se NIKDY neptáme při načtení stránky. Nabídka (karta pod tipem
 * v #pushAsk) se ukáže až po úspěšném podání tipu — háček FundlyPush.afterTip() v js/dashboard.js
 * — a jen dokud hráč neodpoví ("Teď ne" = 30 dní klid). Systémový dotaz prohlížeče jde až
 * z kliknutí na "Zapnout upozornění". Profil → Nastavení (#pushSettingsSlot): hlavní vypínač
 * + tři typy; vypnutí smaže odběr i na serveru.
 * iPhone: web push jen v aplikaci na ploše (iOS 16.4+, standalone) — v Safari se místo
 * zapnutí ukáže návod "Přidat na plochu" (js/pwa.js FundlyPWA.offer()).
 *
 * Data (migrace 044_push.sql, zápis přímo přes supabase-js s JWT hráče, RLS):
 *   push_subscriptions — odběr tohoto zařízení (přihlášení přes RPC push_subscribe),
 *   push_watch — kopie sledovaných zápasů z localStorage "fundly:watchlist" (js/odds-watch.js),
 *                jen když má zařízení zapnutá upozornění na zápasy.
 * Používá: FundlyBackend (js/whop.js), FUNDLY_VAPID_PUBLIC_KEY (js/config.js), FUNDLY_I18N,
 * goView (js/dashboard.js) — vše za běhu, config/whop se načítají s defer.
 */
(function () {
  "use strict";

  const ASK_KEY = "fundly:pushAsk"; // { s: "later" | "done", at }
  const WATCH_KEY = "fundly:watchlist";
  const SYNCED_KEY = "fundly:pushWatchSynced"; // event_id, které tohle zařízení nahrálo do push_watch
  const LATER_MS = 30 * 86400000;
  const WATCH_POLL_MS = 20000;
  const DEFAULT_PREFS = { results: true, matches: true, limit: true };
  const KINDS = ["results", "matches", "limit"];

  // ---------- i18n (namespace "push"; slovenčina padá na češtinu v i18n.js) ----------
  if (typeof FUNDLY_I18N !== "undefined" && FUNDLY_I18N.extend) {
    FUNDLY_I18N.extend("en", { push: {
      askTitle: "Want to know how your tip turns out?",
      askText: "We'll send a notification to your phone as soon as the tip is settled — even with Fundly closed.",
      askBtn: "Turn on notifications", later: "Not now", working: "Turning on…",
      done: "Done — we'll let you know how your tip turns out.",
      denied: "Notifications are blocked in your browser. You can allow them for fundly.games in the browser settings.",
      failed: "Couldn't turn notifications on right now. Try again in Profile → Settings.",
      iosTitle: "Notifications on iPhone",
      iosText: "On iPhone, notifications only work in the Fundly app on your home screen. Tap Share → Add to Home Screen, open Fundly from there and turn them on.",
      iosBtn: "How to add it",
      setTitle: "Phone notifications",
      setText: "A short notification on your lock screen. These settings apply to this device.",
      master: "Turn on notifications", masterD: "On this device",
      results: "Tip results", resultsD: "When your tip is settled",
      matches: "Watched matches", matchesD: "15 minutes before a starred match kicks off",
      limit: "Daily limit", limitD: "When only a quarter of your daily loss limit is left",
      unsupported: "This browser doesn't support phone notifications.",
      blocked: "Notifications for fundly.games are blocked in your browser settings. Allow them there, then turn them on here.",
      iosSet: "On iPhone they only work in the Fundly app on your home screen (iOS 16.4+). Add Fundly to your home screen, open it from there and turn them on here.",
      saveFailed: "Couldn't save. Please try again.",
    } });
    FUNDLY_I18N.extend("cs", { push: {
      askTitle: "Chceš vědět, jak tip dopadne?",
      askText: "Pošleme ti upozornění na telefon, jakmile se tip vyhodnotí — i když budeš mít Fundly zavřené.",
      askBtn: "Zapnout upozornění", later: "Teď ne", working: "Zapínám…",
      done: "Hotovo — dáme ti vědět, jak tip dopadne.",
      denied: "Upozornění jsou v prohlížeči zablokovaná. Povolit je můžeš v nastavení prohlížeče u fundly.games.",
      failed: "Upozornění se teď nepodařilo zapnout. Zkus to znovu v Profil → Nastavení.",
      iosTitle: "Upozornění na iPhonu",
      iosText: "Na iPhonu fungují upozornění jen v aplikaci Fundly na ploše. Klepni na Sdílet → Přidat na plochu, otevři Fundly z plochy a zapni je tam.",
      iosBtn: "Jak přidat na plochu",
      setTitle: "Upozornění na telefon",
      setText: "Krátké upozornění na zamčené obrazovce. Nastavení platí pro toto zařízení.",
      master: "Zapnout upozornění", masterD: "Na tomto zařízení",
      results: "Výsledky tipů", resultsD: "Když se tvůj tip vyhodnotí",
      matches: "Sledované zápasy", matchesD: "15 minut před začátkem zápasu s hvězdičkou",
      limit: "Denní limit", limitD: "Když ti do denního limitu ztráty zbývá čtvrtina",
      unsupported: "Tento prohlížeč upozornění na telefon nepodporuje.",
      blocked: "Upozornění jsou pro fundly.games zablokovaná v nastavení prohlížeče. Povol je tam a pak je zapni tady.",
      iosSet: "Na iPhonu fungují jen v aplikaci Fundly na ploše (iOS 16.4+). Přidej Fundly na plochu, otevři ho odtud a zapni je tady.",
      saveFailed: "Nepodařilo se uložit. Zkus to znovu.",
    } });
  }
  function tr(k) {
    const key = "push." + k;
    const v = typeof window.t === "function" ? window.t(key) : key;
    return v && v !== key ? v : k;
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lang = () => {
    try { return (FUNDLY_I18N.getLang() || "en").slice(0, 2); } catch (e) { return "en"; }
  };

  // ---------- prostředí ----------
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  function standalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function supported() {
    return !!(window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  }
  // iPhone v Safari (ne z plochy): PushManager tam vůbec není — nejdřív přidat na plochu
  const needsInstall = () => isIOS && !standalone() && !supported();
  const permission = () => ("Notification" in window ? Notification.permission : "denied");
  function vapidKey() {
    return typeof FUNDLY_VAPID_PUBLIC_KEY !== "undefined" ? String(FUNDLY_VAPID_PUBLIC_KEY || "") : "";
  }
  function keyBytes(b64) {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function readJson(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function writeJson(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* bez úložiště jen v paměti */ }
  }

  // ---------- backend ----------
  async function session() {
    if (typeof FundlyBackend === "undefined" || typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) return null;
    const client = await FundlyBackend.getClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    const user = data && data.session && data.session.user;
    return user ? { client, user } : null;
  }
  async function registration() {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register("sw.js"); // js/pwa.js ho registruje až po "load"
    return navigator.serviceWorker.ready.then((r) => r || reg);
  }
  async function browserSub() {
    if (!supported()) return null;
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
  }

  // stav tohoto zařízení: { enabled, prefs } (enabled = odběr v prohlížeči + řádek na serveru)
  let state = { enabled: false, prefs: Object.assign({}, DEFAULT_PREFS), endpoint: null };

  async function register(sub, s, prefs) {
    const j = sub.toJSON();
    const { error } = await s.client.rpc("push_subscribe", {
      p_endpoint: j.endpoint, p_p256dh: j.keys && j.keys.p256dh, p_auth: j.keys && j.keys.auth,
      p_prefs: prefs || null, p_lang: lang(),
    });
    if (error) throw error;
    const { data: row } = await s.client.from("push_subscriptions").select("prefs").eq("endpoint", j.endpoint).maybeSingle();
    state = { enabled: true, prefs: Object.assign({}, DEFAULT_PREFS, (row && row.prefs) || prefs || {}), endpoint: j.endpoint };
  }

  // volat jen z kliknutí (systémový dotaz na povolení potřebuje gesto uživatele)
  async function enable() {
    if (!supported()) throw new Error("unsupported");
    const key = vapidKey();
    if (!key) throw new Error("no VAPID key");
    let perm = permission();
    if (perm === "default") perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const s = await session();
    if (!s) throw new Error("not signed in");
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await register(sub, s, null);
    writeJson(ASK_KEY, { s: "done", at: Date.now() });
    watchSig = "";
    syncWatch();
    return "granted";
  }

  async function disable() {
    const s = await session();
    const sub = await browserSub();
    await clearWatch(s);
    if (s && sub) {
      const { error } = await s.client.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      if (error) throw error;
    }
    if (sub) await sub.unsubscribe().catch(() => {});
    state = { enabled: false, prefs: Object.assign({}, DEFAULT_PREFS), endpoint: null };
    writeJson(ASK_KEY, { s: "done", at: Date.now() }); // vypnul to sám → už se neptat pod tipem
  }

  async function setPref(kind, on) {
    const s = await session();
    if (!s || !state.endpoint) throw new Error("not enabled");
    const prefs = Object.assign({}, state.prefs, { [kind]: !!on });
    const { error } = await s.client.from("push_subscriptions").update({ prefs }).eq("endpoint", state.endpoint);
    if (error) throw error;
    state.prefs = prefs;
    if (kind === "matches") { if (on) { watchSig = ""; await syncWatch(); } else await clearWatch(s); }
  }

  // po načtení: existující odběr znovu přihlásit (obnoví klíče, převezme ho aktuální účet,
  // vrátí řádek smazaný po chybě push služby) — nic se neptá, jen když už povolení je
  async function refresh() {
    try {
      if (!supported() || permission() !== "granted") return;
      const sub = await browserSub();
      if (!sub) return;
      const s = await session();
      if (!s) return;
      await register(sub, s, null);
      syncWatch();
    } catch (e) {
      console.warn("push refresh:", e && e.message);
    } finally {
      renderSettings();
    }
  }

  // ---------- sledované zápasy → push_watch ----------
  let watchSig = "";
  let watchBusy = false;
  function watchedNow() {
    const list = readJson(WATCH_KEY, []);
    const now = Date.now();
    return (Array.isArray(list) ? list : [])
      .filter((e) => e && e.id && /^[A-Za-z0-9_:.-]{1,64}$/.test(String(e.id)) && Date.parse(e.date) > now)
      .slice(0, 30)
      .map((e) => ({
        event_id: String(e.id),
        start_time: new Date(Date.parse(e.date)).toISOString(),
        label: `${String(e.home || "").trim()} – ${String(e.away || "").trim()}`.slice(0, 200),
        sport: e.sport ? String(e.sport).slice(0, 60) : null,
      }));
  }
  async function syncWatch() {
    if (watchBusy || !state.enabled || !state.prefs.matches) return;
    const rows = watchedNow();
    const sig = rows.map((r) => r.event_id + "@" + r.start_time).sort().join("|");
    if (sig === watchSig) return;
    watchBusy = true;
    try {
      const s = await session();
      if (!s) return;
      const prev = readJson(SYNCED_KEY, []);
      const ids = rows.map((r) => r.event_id);
      const gone = (Array.isArray(prev) ? prev : []).filter((id) => !ids.includes(id));
      if (rows.length) {
        const { error } = await s.client.from("push_watch")
          .upsert(rows.map((r) => Object.assign({ user_id: s.user.id }, r)), { onConflict: "user_id,event_id" });
        if (error) throw error;
      }
      if (gone.length) {
        const { error } = await s.client.from("push_watch").delete().eq("user_id", s.user.id).in("event_id", gone);
        if (error) throw error;
      }
      writeJson(SYNCED_KEY, ids);
      watchSig = sig;
    } catch (e) {
      console.warn("push watch sync:", e && e.message);
    } finally {
      watchBusy = false;
    }
  }
  async function clearWatch(s) {
    const prev = readJson(SYNCED_KEY, []);
    watchSig = "";
    if (!Array.isArray(prev) || !prev.length) return;
    try {
      s = s || (await session());
      if (s) await s.client.from("push_watch").delete().eq("user_id", s.user.id).in("event_id", prev);
      writeJson(SYNCED_KEY, []);
    } catch (e) { /* nevadí — push-dispatch po odeslání stejně neposílá znovu */ }
  }

  // ---------- styly (jen pro naše prvky; přepínače používají .switch z css/dashboard.css) ----------
  function css() {
    if (document.getElementById("fpush-css")) return;
    const s = document.createElement("style");
    s.id = "fpush-css";
    s.textContent =
      ".push-ask{margin-top:12px;padding:14px;border-radius:12px;background:var(--surface-1,#0d0d12);box-shadow:inset 0 0 0 1px var(--accent-border-soft,rgba(20,241,149,.3))}" +
      ".push-ask .pa-t{font-weight:700;font-size:.9375rem;color:var(--text-primary,#fff)}" +
      ".push-ask .pa-d{font-size:.8125rem;color:var(--text-muted,#a9a9b8);margin-top:4px;line-height:1.45}" +
      ".push-ask .pa-b{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}" +
      ".push-ask .pa-b .btn{height:auto;padding:9px 14px;font-size:.8125rem}" +
      ".push-set .switch-row{padding:10px 0;border-top:1px solid var(--border,#ffffff14)}" +
      ".push-set .switch-row:first-of-type{border-top:0}" +
      ".push-set .push-sub{padding-left:14px}" +
      ".push-set .push-sub.off{opacity:.45}" +
      ".push-set .switch:disabled{cursor:not-allowed}";
    document.head.appendChild(s);
  }

  // ---------- karta pod podaným tipem ----------
  function askAllowed() {
    const a = readJson(ASK_KEY, null);
    if (!a || !a.s) return true;
    if (a.s === "later") return Date.now() - (Number(a.at) || 0) > LATER_MS;
    return false;
  }
  function askBox() { return document.getElementById("pushAsk"); }
  function hideAsk() { const b = askBox(); if (b) { b.hidden = true; b.innerHTML = ""; } }

  async function afterTip() {
    try {
      const box = askBox();
      if (!box || !box.hidden || !askAllowed() || window.__noRealAccount) return;
      const install = needsInstall();
      if (!install) {
        if (!supported() || !vapidKey() || permission() === "denied") return;
        if (await browserSub()) return; // už zapnuté na tomhle zařízení
      }
      if (!(await session())) return;
      css();
      box.innerHTML = install
        ? `<div class="push-ask" role="region" aria-label="${esc(tr("iosTitle"))}">
            <div class="pa-t">${esc(tr("askTitle"))}</div>
            <div class="pa-d">${esc(tr("iosText"))}</div>
            <div class="pa-b">
              ${window.FundlyPWA ? `<button type="button" class="btn btn-primary" data-pa="install">${esc(tr("iosBtn"))}</button>` : ""}
              <button type="button" class="btn btn-ghost" data-pa="later">${esc(tr("later"))}</button>
            </div></div>`
        : `<div class="push-ask" role="region" aria-label="${esc(tr("askTitle"))}">
            <div class="pa-t">${esc(tr("askTitle"))}</div>
            <div class="pa-d" data-pa-msg>${esc(tr("askText"))}</div>
            <div class="pa-b">
              <button type="button" class="btn btn-primary" data-pa="on">${esc(tr("askBtn"))}</button>
              <button type="button" class="btn btn-ghost" data-pa="later">${esc(tr("later"))}</button>
            </div></div>`;
      box.hidden = false;
      box.onclick = onAskClick;
    } catch (e) {
      console.warn("push ask:", e && e.message);
    }
  }

  async function onAskClick(e) {
    const btn = e.target.closest("[data-pa]");
    if (!btn) return;
    const what = btn.dataset.pa;
    const box = askBox();
    if (what === "later") {
      writeJson(ASK_KEY, { s: "later", at: Date.now() });
      hideAsk();
      return;
    }
    if (what === "install") {
      writeJson(ASK_KEY, { s: "later", at: Date.now() }); // v aplikaci na ploše má vlastní úložiště → zeptá se tam
      try { window.FundlyPWA.offer(); } catch (err) { /* */ }
      hideAsk();
      return;
    }
    // "on": requestPermission musí běžet přímo z tohohle kliknutí
    const msg = box.querySelector("[data-pa-msg]");
    box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    btn.textContent = tr("working");
    let text;
    try {
      const r = await enable();
      text = r === "granted" ? tr("done") : tr("denied");
      if (r !== "granted") writeJson(ASK_KEY, { s: "done", at: Date.now() });
    } catch (err) {
      console.warn("push enable:", err && err.message);
      text = tr("failed");
      writeJson(ASK_KEY, { s: "later", at: Date.now() });
    }
    const btns = box.querySelector(".pa-b");
    if (btns) btns.remove();
    if (msg) msg.textContent = text;
    renderSettings();
    setTimeout(hideAsk, 6000);
  }

  // ---------- Profil → Nastavení ----------
  let settingsNote = "";
  function switchRow(id, title, desc, on, opts) {
    opts = opts || {};
    return `<div class="switch-row${opts.sub ? " push-sub" : ""}${opts.sub && opts.disabled ? " off" : ""}">
      <div class="grow"><div class="t" id="${id}L">${esc(title)}</div><div class="d">${esc(desc)}</div></div>
      <button type="button" class="switch" role="switch" id="${id}" aria-labelledby="${id}L" aria-checked="${on ? "true" : "false"}"${opts.disabled ? " disabled" : ""}${opts.kind ? ` data-push-kind="${opts.kind}"` : ""}></button>
    </div>`;
  }
  function renderSettings() {
    const slot = document.getElementById("pushSettingsSlot");
    if (!slot) return;
    if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) { slot.innerHTML = ""; return; }
    css();
    let body;
    if (needsInstall()) {
      body = `<p class="t-small">${esc(tr("iosSet"))}</p>` +
        (window.FundlyPWA ? `<button type="button" class="btn btn-ghost" style="margin-top:10px" data-push-install>${esc(tr("iosBtn"))}</button>` : "");
    } else if (!supported() || !vapidKey()) {
      body = `<p class="t-small">${esc(tr("unsupported"))}</p>`;
    } else if (permission() === "denied" && !state.enabled) {
      body = `<p class="t-small">${esc(tr("blocked"))}</p>`;
    } else {
      const on = state.enabled;
      body = switchRow("pushMaster", tr("master"), tr("masterD"), on) +
        KINDS.map((k) => switchRow("push_" + k, tr(k), tr(k + "D"), on && state.prefs[k] !== false, { sub: true, disabled: !on, kind: k })).join("");
    }
    slot.innerHTML = `<div class="panel mt push-set">
        <h3>${esc(tr("setTitle"))}</h3>
        <p class="t-small" style="margin-bottom:6px">${esc(tr("setText"))}</p>
        ${body}
        <p class="auth-note mt error" id="pushSetNote"${settingsNote ? "" : " hidden"}>${esc(settingsNote)}</p>
      </div>`;
    slot.onclick = onSettingsClick;
  }
  let settingsBusy = false;
  async function onSettingsClick(e) {
    if (e.target.closest("[data-push-install]")) { try { window.FundlyPWA.offer(); } catch (err) { /* */ } return; }
    const sw = e.target.closest("button.switch");
    if (!sw || sw.disabled || settingsBusy) return;
    const turnOn = sw.getAttribute("aria-checked") !== "true";
    settingsBusy = true;
    sw.setAttribute("aria-checked", String(turnOn)); // hned vidět reakci
    settingsNote = "";
    try {
      if (sw.id === "pushMaster") {
        if (turnOn) {
          const r = await enable();
          if (r !== "granted") settingsNote = tr("denied");
        } else {
          await disable();
        }
      } else if (sw.dataset.pushKind) {
        await setPref(sw.dataset.pushKind, turnOn);
      }
    } catch (err) {
      console.warn("push settings:", err && err.message);
      settingsNote = tr("saveFailed");
    } finally {
      settingsBusy = false;
      renderSettings();
    }
  }

  // ---------- napojení ----------
  function init() {
    renderSettings();
    refresh();
    // klik na hvězdičku (js/odds-watch.js zastaví bublání na #matchList → poslouchat v capture)
    document.addEventListener("click", (e) => {
      if (state.enabled && e.target.closest && e.target.closest(".ow-star")) setTimeout(syncWatch, 400);
    }, true);
    window.addEventListener("storage", (e) => { if (e.key === WATCH_KEY) syncWatch(); });
    setInterval(() => { if (!document.hidden) syncWatch(); }, WATCH_POLL_MS);
    document.addEventListener("visibilitychange", () => { if (document.hidden) syncWatch(); });
    document.addEventListener("fundly:lang-changed", async () => {
      renderSettings();
      if (!state.enabled) return;
      try { const s = await session(); if (s) await s.client.from("push_subscriptions").update({ lang: lang() }).eq("endpoint", state.endpoint); } catch (err) { /* */ }
    });
    // klepnutí na upozornění při otevřeném dashboardu (sw.js notificationclick)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (e) => {
        const d = e.data || {};
        if (d.type !== "fundly:push-open" || !/^[a-z]+$/.test(String(d.view || ""))) return;
        if (typeof goView === "function") goView(d.view);
        else location.hash = d.view;
      });
    }
  }
  // config.js / whop.js (FundlyBackend) se načítají s defer → běží až po tomhle skriptu
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  window.FundlyPush = {
    afterTip,
    enable,
    disable,
    state: () => Object.assign({}, state, { prefs: Object.assign({}, state.prefs) }),
    _syncWatch: syncWatch,
  };
})();
