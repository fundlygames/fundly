/* Fundly dashboard — section switching, betting, leaderboard, profile */

// záporná částka jako "−$85" (ne "$-85")
const usd = (n) => { const v = Math.round(n); return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US"); };

// Form texts/messages come from the i18n dictionary (js/i18n.js, group "forms").
const ft = (key) => (typeof window.t === "function" ? window.t(key) : key);
// Texty generované v JS: klíče dashjs.* v js/i18n-dash-js.js. ftf = s proměnnými ({amount} …),
// ftp = množné číslo (podklíče one/few/other — čeština 1 / 2–4 / ostatní).
const ftf = (key, vars) => (typeof window.tf === "function" ? window.tf(key, vars) : key);
const ftp = (key, n, vars) => ftf(`${key}.${n === 1 ? "one" : n >= 2 && n <= 4 ? "few" : "other"}`, { n, ...(vars || {}) });
// Locale pro data/časy podle zvoleného jazyka (cs → cs-CZ = 24h čas, sk → sk-SK, jinak en-US).
// Peníze zůstávají ve formátu USD ($1,234) přes usd().
function uiLocale() {
  const lang = window.FUNDLY_I18N && typeof window.FUNDLY_I18N.getLang === "function" ? window.FUNDLY_I18N.getLang() : "en";
  return lang === "cs" ? "cs-CZ" : lang === "sk" ? "sk-SK" : "en-US";
}
// Anglické hlášky ze serveru (důvody storna tiketu — supabase/functions/_shared/ticket-admission.ts VOID,
// request-payout, profile-update, affiliate-stats) → překlad podle přesného textu; neznámé beze změny.
const SERVER_MSG_KEYS = {
  "The entry was above the maximum entry size for your package.": "stake",
  "One of the odds was outside the allowed range (1.00–8.00).": "oddsRange",
  "A single ticket can't account for more than 40 % of the phase profit target.": "profitLimit",
  "You already had a pending bet on one of these matches.": "duplicateEvent",
  "The match had already finished when the ticket was received.": "finished",
  "The match was no longer available for betting.": "unavailable",
  "That market was no longer available when the ticket was received.": "noMarket",
  "The odds had changed by the time the ticket was received.": "oddsChanged",
  "The match had already started and could not be confirmed as live.": "notLive",
  "Please sign in to make a withdrawal.": "signInWd",
  "Choose a payout method.": "chooseMethod",
  "You have no challenge account.": "noAccount",
  "Withdrawals are only available on a funded account.": "fundedOnly",
  "Pay the activation fee first.": "activationFirst",
  "You already have a pending withdrawal request.": "pendingWd",
  "There is no profit share available to withdraw yet.": "noShare",
  "The request could not be submitted.": "wdFailed",
  "Please sign in first.": "signIn",
  "Please sign in.": "signInShort",
  "Invalid access token.": "invalidToken",
  "That nickname isn't allowed — please choose another.": "nickBad",
  "Nothing to update.": "nothing",
  "Update failed.": "updateFailed",
  "Affiliate stats could not be loaded.": "affFail",
};
const SERVER_MSG_PATTERNS = [
  [/^The minimum withdrawal is (\$[\d,.]+)\.$/, "minWd", "amount"],
  [/^The maximum withdrawal per request is (\$[\d,.]+)\.$/, "maxWd", "amount"],
  [/^You can request your next payout starting (\S+) \(14-day cooldown between payouts\)\.$/, "cooldown", "date"],
  [/^The requested amount is above your available profit share \((\$[\d,.]+)\)\.$/, "aboveShare", "amount"],
];
function srvMsg(msg) {
  if (!msg) return msg;
  const s = String(msg).trim();
  if (SERVER_MSG_KEYS[s]) return ft(`dashjs.srv.${SERVER_MSG_KEYS[s]}`);
  for (const [re, key, name] of SERVER_MSG_PATTERNS) {
    const m = re.exec(s);
    if (m) return ftf(`dashjs.srv.${key}`, { [name]: m[1] });
  }
  return msg;
}

// Kdy server naposledy zaznamenal vstup do pending_approval (viz
// syncChallengeAccount) — použito jen pro "čekáš už X" text v bannerů,
// nic to nerozhoduje.
let pendingApprovalSince = null;

// Poslední fetch challenge_accounts z syncChallengeAccount() — renderProfile()
// z toho staví "Your account history" panel (i pro hráče s aktivním účtem,
// ne jen v showLimitedDashboard). Jen pro zobrazení, nic to nerozhoduje.
let lastFetchedAccounts = [];

// Zapomenuté heslo: Supabase po kliknutí na odkaz z e-mailu přesměruje sem
// s "#access_token=...&type=recovery" ve fragmentu — supabase-js z toho sám
// založí dočasnou přihlášenou session, ale nikam sama od sebe nenaviguje.
// Fragment si musíme zachytit HNED (dřív, než ho supabase-js při zpracování
// smaže z URL), abychom pak hráče mohli poslat rovnou na pole "New password"
// místo aby zůstal na Overview a nevěděl, že se vlastně přihlásil.
const isPasswordRecovery = /type=recovery/.test(window.location.hash);

function jumpToPasswordSettings(prefix) {
  if (prefix === "s" && typeof showView === "function") {
    showView("profil");
    document.querySelector('#profileTabs button[data-ptab="settings"]')?.click();
  }
  setTimeout(() => {
    const input = document.getElementById(`${prefix}NewPass`);
    if (!input) return;
    input.scrollIntoView({ behavior: "smooth", block: "center" });
    input.focus();
  }, 50);
  if (typeof showToast === "function") {
    showToast("win", ft("dashjs.toast.setPassTitle"), ft("dashjs.toast.setPassBody"));
  }
}

// "Log out" byl doteď jen <a href="./"> bez skutečného odhlášení — session
// v Supabase zůstávala platná, jen se opustila stránka. Nemazat přitom
// bf2:portfolio: na stejném prohlížeči má hráč po opětovném přihlášení
// vidět svoje tikety rovnou z lokálního stavu, ne čekat na restore ze
// serveru (ten je pojistka pro NOVÝ prohlížeč/zařízení, ne běžnou cestu).
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-logout]");
  if (!btn) return;
  e.preventDefault();
  if (btn.dataset.loggingOut) return; // dvojklik
  btn.dataset.loggingOut = "1";
  btn.style.opacity = ".5";
  btn.style.pointerEvents = "none";
  const href = btn.getAttribute("href") || "./";
  // nejdřív dotlačit poslední lokální stav na server (bez debounce), pak
  // teprve odhlásit — jinak mohl hráč vsadit a hned kliknout na Log out
  // dřív, než uplynulo okno debounce v syncAccountNow(), a poslední tiket
  // se na server nikdy nedostal. Reálně naměřeno ~2-4 s (getSession +
  // 2 sekvenční fetch), proto vizuální stav výš — jinak to bez zpětné
  // vazby pár vteřin vypadá jako zaseknuté tlačítko. Tvrdý strop 5 s, ať
  // pomalá síť neuvězní hráče na obrazovce navěky.
  const flush = typeof pushAccountSnapshot === "function" ? pushAccountSnapshot() : Promise.resolve();
  const capped = Promise.race([flush.catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  capped.finally(() => {
    window.FundlyPromo?.setActivePlayer(false);
    FundlyAuth.signOut().catch(() => {}).finally(() => { window.location.href = href; });
  });
});

// ---------- section switching ----------
// "nastroje" = Nástroje (kalkulačky + deník tipů, js/tools.js + js/journal.js)
const views = ["prehled", "vykon", "sazeni", "zebricek", "vyplaty", "affiliate", "novinky", "nastroje", "akademie", "profil"];

// "More" sheet na mobilu: sekce, co se nevejdou do spodní lišty
// (Leaderboard/Affiliate/Academy/Profile) — otevře se přes #dnavMoreBtn.
const MORE_SHEET_VIEWS = ["zebricek", "affiliate", "novinky", "nastroje", "akademie", "profil"];

// Odměny ve fázi 1/2: krokový ukazatel Fáze 1 → Fáze 2 → Partner místo nepoužitelného formuláře.
// Na Partner účtu se ukáže původní formulář žádosti, podmínky a historie.
function renderRewardsLock() {
  const view = document.getElementById("view-vyplaty");
  const card = document.getElementById("wdLockCard");
  const state = Portfolio.get();
  if (!view || !card || !state) return;
  const locked = state.phase !== "funded";
  view.classList.toggle("wd-locked", locked);
  card.hidden = !locked;
  if (!locked) return;
  const target = Portfolio.phaseTarget(state);
  const profit = state.balance - state.phaseBaseline;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((profit / target) * 100))) : 0;
  const cur = state.phase === 2 ? 2 : 1;
  const step = (n, key) => {
    const cls = n < cur ? "done" : n === cur ? "now" : "";
    return `<li class="${cls}"><span class="wl-dot">${n < cur ? "✓" : n}</span><span><b>${esc(ft(`dashjs.rewardsLock.s${n}`))}</b><small>${esc(ft(`dashjs.rewardsLock.s${n}d`))}</small></span></li>`;
  };
  card.innerHTML = `
    <h3>${esc(ft("dashjs.rewardsLock.title"))}</h3>
    <ol class="wl-steps">${step(1)}${step(2)}${step(3)}</ol>
    <p class="t-small">${esc(state.pendingPhase ? ftf("dashjs.rewardsLock.pending", { n: cur }) : ftf("dashjs.rewardsLock.now", { n: cur, pct }))}</p>
    <div class="progress"><span style="width:${state.pendingPhase ? 100 : pct}%"></span></div>
    <button type="button" class="btn btn-primary" data-view-link="sazeni" style="margin-top:14px;width:100%">${esc(ft("dashjs.rewardsLock.cta"))}</button>`;
}

// Přepínání sekcí přes historii prohlížeče: tlačítko Zpět na telefonu vrátí na předchozí
// sekci (dřív zavřelo celý dashboard) a adresa dashboard#novinky otevře rovnou Novinky.
const ROUTABLE_VIEWS = new Set([...views, "noaccount"]);
function goView(name) {
  showView(name);
  try {
    if (!history.state || history.state.view !== name) history.pushState({ view: name }, "", "#" + name);
  } catch (e) { /* bez history API jen přepnutí */ }
}
window.addEventListener("popstate", (e) => {
  let v = (e.state && e.state.view) || location.hash.slice(1);
  if (v === "prehled" && document.body.classList.contains("limited")) v = "noaccount";
  if (ROUTABLE_VIEWS.has(v)) showView(v);
  else if (!location.hash || location.hash === "#") showView(document.body.classList.contains("limited") ? "noaccount" : "prehled");
});

function closeMoreSheet() {
  const sheet = document.getElementById("dnavMoreSheet");
  const btn = document.getElementById("dnavMoreBtn");
  if (sheet) sheet.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  // omezený režim (bez aktivního účtu): přehled účtů ↔ Akademie / Novinky (přístup 30 dní po nákupu)
  const naView = document.getElementById("view-noaccount");
  if (naView && document.body.classList.contains("limited")) naView.hidden = name !== "noaccount";
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  const moreBtn = document.getElementById("dnavMoreBtn");
  if (moreBtn) moreBtn.classList.toggle("active", MORE_SHEET_VIEWS.includes(name));
  closeMoreSheet();
  // plovoucí "ticket added" lišta patří jen na Betting sekci
  const slipBar = document.getElementById("mobileSlipBar");
  if (slipBar && name !== "sazeni") slipBar.hidden = true;
  else if (slipBar && name === "sazeni" && typeof updateMobileSlipBar === "function") updateMobileSlipBar();
  window.scrollTo({ top: 0, behavior: "instant" });
  if (name === "prehled" && typeof renderPrehled === "function") renderPrehled();
  if (name === "vykon" && typeof renderVykon === "function") renderVykon();
  if (name === "sazeni" && typeof renderBankBar === "function") renderBankBar();
  if (name === "sazeni") {
    const preview = document.getElementById("previewModePanel");
    if (preview) preview.hidden = !window.__noRealAccount;
  }
  if (name === "profil" && typeof renderBadges === "function") renderBadges(Portfolio.get());
  if (name === "vyplaty") renderRewardsLock();
  if (name === "vyplaty" && typeof loadPayoutHistory === "function") loadPayoutHistory();
  if (name === "affiliate" && typeof loadAffiliateStats === "function") loadAffiliateStats();
  if (name === "zebricek" && typeof loadLeaderboard === "function") loadLeaderboard();
  if (name === "novinky") loadNews();
  if (name === "nastroje" && window.FundlyTools) window.FundlyTools.onShow(); // js/tools.js
}

// ---------- Novinky: sportovní zprávy (edge funkce sports-news, cache 15 min) ----------
// Jen titulek, zdroj, čas a odkaz na web zdroje — text článků nepřebíráme (autorská práva).
let newsData = { lang: null, at: 0, items: [] };
let newsSource = "";
function newsLang() {
  const l = (typeof FUNDLY_I18N !== "undefined" && FUNDLY_I18N.getLang()) || "en";
  return l === "cs" || l === "sk" ? "cs" : "en";
}
function timeAgo(iso) {
  if (!iso) return "";
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return ftf("dashjs.news.minAgo", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return ftf("dashjs.news.hAgo", { n: h });
  return new Date(iso).toLocaleDateString(newsLang() === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "short" });
}
const newsEsc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// sport → ikona (assets/sports) a klíč popisku
const NEWS_SPORTS = {
  football: "fotbal", hockey: "hokej", tennis: "tenis", basketball: "basketbal", mma: "mma",
  motorsport: "f1", esports: "esporty", amfootball: null, other: null,
};
let newsSport = "";
let newsShown = 13;
function newsThumb(i, cls) {
  const icon = NEWS_SPORTS[i.sport];
  const ph = `<div class="${cls} news-ph news-ph-${newsEsc(i.sport)}">${icon ? `<img src="assets/sports/${icon}.png" alt="" />` : `<img src="assets/logo.png" alt="" class="news-ph-logo" />`}</div>`;
  if (!i.image) return ph;
  // obrázek z RSS zdroje (náhled, který vydavatel sám nabízí); při chybě načtení náhradní ikona
  return `<div class="${cls}"><img src="${newsEsc(i.image)}" alt="" loading="lazy" referrerpolicy="no-referrer"
    onerror="this.parentNode.outerHTML=this.parentNode.dataset.ph" /></div>`.replace(`class="${cls}"`, `class="${cls}" data-ph="${newsEsc(ph)}"`);
}
function newsMeta(i) {
  const sp = i.sport && i.sport !== "other" ? `<span class="news-sport">${newsEsc(ft("dashjs.news.sport." + i.sport))}</span>` : "";
  return `<div class="news-meta"><span class="news-src">${newsEsc(i.source)}</span>${sp}<span>${newsEsc(timeAgo(i.published))}</span></div>`;
}
function renderNews() {
  const list = document.getElementById("newsList");
  const filters = document.getElementById("newsFilters");
  if (!list) return;
  const sports = Object.keys(NEWS_SPORTS).filter((k) => newsData.items.some((i) => i.sport === k));
  const bySport = newsData.items.filter((i) => !newsSport || i.sport === newsSport);
  const sources = [...new Set(bySport.map((i) => i.source))];
  if (newsSource && !sources.includes(newsSource)) newsSource = "";
  if (filters) {
    const chip = (attr, val, label, on, icon) =>
      `<button type="button" ${attr}="${newsEsc(val)}" aria-pressed="${on}">${icon ? `<img src="assets/sports/${icon}.png" alt="" />` : ""}${newsEsc(label)}</button>`;
    filters.innerHTML =
      `<div class="news-row">${chip("data-news-sport", "", ft("dashjs.news.allSports"), !newsSport)}${sports.map((k) => chip("data-news-sport", k, ft("dashjs.news.sport." + k), newsSport === k, NEWS_SPORTS[k])).join("")}</div>` +
      `<div class="news-row news-row-src">${chip("data-news-src", "", ft("dashjs.news.all"), !newsSource)}${sources.map((src) => chip("data-news-src", src, src, newsSource === src)).join("")}</div>`;
  }
  const items = bySport.filter((i) => !newsSource || i.source === newsSource);
  if (!items.length) { list.innerHTML = `<p class="bet-msg">${newsEsc(ft("dashjs.news.empty"))}</p>`; return; }
  const featIdx = Math.max(0, items.findIndex((i) => i.image));
  const feat = items[featIdx];
  const rest = items.filter((_, k) => k !== featIdx);
  const read = (i) => newsEsc(ftf("dashjs.news.readOn", { source: i.source }));
  const card = (i) => `
    <a class="news-card" href="${newsEsc(i.link)}" target="_blank" rel="noopener noreferrer">
      ${newsThumb(i, "news-img")}
      <div class="news-body">${newsMeta(i)}
        <div class="news-title">${newsEsc(i.title)}</div>
        ${i.summary ? `<p class="news-sum">${newsEsc(i.summary)}</p>` : ""}
        <span class="news-read">${read(i)} ↗</span>
      </div>
    </a>`;
  const shown = rest.slice(0, newsShown - 1);
  list.innerHTML = `
    <a class="news-feat" href="${newsEsc(feat.link)}" target="_blank" rel="noopener noreferrer">
      ${newsThumb(feat, "news-feat-img")}
      <div class="news-body">${newsMeta(feat)}
        <div class="news-feat-title">${newsEsc(feat.title)}</div>
        ${feat.summary ? `<p class="news-sum">${newsEsc(feat.summary)}</p>` : ""}
        <span class="news-read">${read(feat)} ↗</span>
      </div>
    </a>
    <div class="news-grid">${shown.map(card).join("")}</div>
    ${rest.length > shown.length ? `<button type="button" class="btn btn-ghost news-more" data-news-more>${newsEsc(ft("dashjs.news.more"))}</button>` : ""}`;
}
async function loadNews(force) {
  const lang = newsLang();
  if (!force && newsData.lang === lang && Date.now() - newsData.at < 5 * 60 * 1000 && newsData.items.length) { renderNews(); return; }
  const list = document.getElementById("newsList");
  if (list && !newsData.items.length) list.innerHTML = `<p class="bet-msg">${newsEsc(ft("dashjs.news.loading"))}</p>`;
  try {
    if (typeof FUNDLY_SUPABASE_URL === "undefined") throw new Error("no backend");
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/sports-news?lang=${lang}`);
    const data = await res.json();
    if (!Array.isArray(data.items) || !data.items.length) throw new Error("empty");
    newsData = { lang, at: Date.now(), items: data.items };
    if (newsSource && !data.items.some((i) => i.source === newsSource)) newsSource = "";
    renderNews();
  } catch (e) {
    if (list && !newsData.items.length) list.innerHTML = `<p class="bet-msg">${newsEsc(ft("dashjs.news.error"))}</p>`;
  }
}
document.addEventListener("click", (e) => {
  const src = e.target.closest("[data-news-src]");
  const sp = e.target.closest("[data-news-sport]");
  const more = e.target.closest("[data-news-more]");
  if (!src && !sp && !more) return;
  if (src) { newsSource = src.dataset.newsSrc; newsShown = 13; }
  if (sp) { newsSport = sp.dataset.newsSport; newsSource = ""; newsShown = 13; }
  if (more) newsShown += 12;
  renderNews();
});
document.addEventListener("fundly:lang-changed", () => {
  const v = document.getElementById("view-novinky");
  if (v && !v.hidden) loadNews(true);
});

document.addEventListener("click", (e) => {
  const moreBtn = e.target.closest("#dnavMoreBtn");
  if (moreBtn) {
    const sheet = document.getElementById("dnavMoreSheet");
    const open = sheet.hidden;
    const pwaRow = sheet.querySelector("[data-pwa-offer]");
    if (pwaRow) pwaRow.hidden = !(window.FundlyPWA && window.FundlyPWA.available && window.FundlyPWA.available());
    sheet.hidden = !open;
    moreBtn.setAttribute("aria-expanded", String(open));
    return;
  }
  if (e.target.closest("[data-pwa-offer]")) { closeMoreSheet(); window.FundlyPWA?.offer?.(); return; }
  const nav = e.target.closest("[data-view]");
  if (nav) { goView(nav.dataset.view); return; }
  const link = e.target.closest("[data-view-link]");
  if (link) { goView(link.dataset.viewLink); return; }
  if (!e.target.closest("#dnavMoreSheet")) closeMoreSheet();
});

// ---------- overview: sub-tabs ----------
document.querySelectorAll("#ovTabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#ovTabs button").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    document.querySelectorAll("[data-ovpanel]").forEach((p) => {
      p.hidden = p.dataset.ovpanel !== btn.dataset.ovtab;
    });
  });
});

// ---------- tikety: rozbalení detailu + early cashout ----------
document.addEventListener("click", (e) => {
  // cashout tlačítko (v detailu tiketu)
  const co = e.target.closest("[data-cashout]");
  if (co) {
    const state = Portfolio.get();
    const t = state && state.tickets.find((x) => x.id === co.dataset.cashout);
    if (!t) return;
    const amount = Math.round(t.stake * 0.9);
    if (!window.confirm(ftf("dashjs.toast.cashoutConfirm", { amount: usd(amount) }))) return;
    const r = Portfolio.cashOut(co.dataset.cashout);
    if (r.ok) {
      showToast("push", ft("dashjs.toast.cashedOut"), `+${usd(r.cashout)}`);
      if (typeof renderPrehled === "function") renderPrehled();
      if (typeof renderVykon === "function") renderVykon();
      if (typeof renderBankBar === "function") renderBankBar();
      if (typeof scheduleAccountSync === "function") scheduleAccountSync();
    } else {
      showToast("loss", ft("dashjs.toast.cantCashOut"), r.error || ft("dashjs.toast.cantCashOutBody"));
    }
    return;
  }
  // rozbalení řádku v tabulce Výkonu
  const row = e.target.closest(".tk-exp");
  if (row) {
    const det = row.nextElementSibling;
    if (det && det.classList.contains("tk-detail")) det.hidden = !det.hidden;
  }
});

// ---------- celebrations: toast + confetti on ticket settlement ----------
function showToast(kind, title, detail) {
  const layer = document.getElementById("toastLayer");
  Notifications.push(kind, title, detail);
  if (!layer) return;
  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.innerHTML = `<div class="toast-title">${title}</div>${detail ? `<div class="toast-detail">${detail}</div>` : ""}`;
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => {
    el.classList.remove("in");
    setTimeout(() => el.remove(), 300);
  }, 4200);
}

// ---------- notifications: bell dropdown, persisted log of everything shown as a toast ----------
// (ticket won/lost, new badge, account active, inactivity warnings, ...) —
// showToast() above pushes into it, so every toast the app already fires
// automatically becomes a notification too.
const Notifications = (() => {
  const KEY = "bf2:notifications";
  const MAX = 50;
  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) {}
  }
  function push(kind, title, detail) {
    const list = get();
    list.unshift({
      id: `n${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      kind, title, detail: detail || "", t: new Date().toISOString(), read: false,
    });
    save(list);
    renderNotifications();
  }
  function markAllRead() {
    save(get().map((n) => ({ ...n, read: true })));
  }
  function clearAll() {
    save([]);
    renderNotifications();
  }
  return { get, push, markAllRead, clearAll };
})();

const NOTIF_ICON = { win: "✓", loss: "✕", push: "↺", pend: "•", badge: "🏅" };

function renderNotifications() {
  const list = Notifications.get();
  const unread = list.filter((n) => !n.read).length;
  document.querySelectorAll(".notif-dot").forEach((d) => { d.hidden = !unread; });
  const listEl = document.getElementById("notifList");
  if (!listEl) return;
  listEl.innerHTML = list.length
    ? list.map((n) => `
      <div class="notif-item ${n.read ? "" : "unread"}">
        <span class="notif-ic ${n.kind === "loss" ? "loss" : n.kind === "win" || n.kind === "badge" ? "win" : "pend"}">${NOTIF_ICON[n.kind] || "•"}</span>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          ${n.detail ? `<div class="notif-detail">${n.detail}</div>` : ""}
          <div class="notif-time">${new Date(n.t).toLocaleString(uiLocale())}</div>
        </div>
      </div>`).join("")
    : `<div class="notif-empty">${ft("dashjs.notif.empty")}</div>`;
}
renderNotifications();

document.querySelectorAll("[data-notif-toggle]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const panel = document.getElementById("notifPanel");
    if (!panel) return;
    const opening = panel.hidden;
    panel.hidden = !opening;
    if (opening) {
      Notifications.markAllRead();
      renderNotifications();
    }
  });
});
document.addEventListener("click", (e) => {
  const panel = document.getElementById("notifPanel");
  if (!panel || panel.hidden) return;
  if (!panel.contains(e.target) && !e.target.closest("[data-notif-toggle]")) panel.hidden = true;
});
document.getElementById("notifClearAll")?.addEventListener("click", () => Notifications.clearAll());

function fireConfetti() {
  const colors = ["#14f195", "#7af7c4", "#ffce7a", "#5ee8ff", "#ffffff"];
  const container = document.createElement("div");
  container.className = "confetti-layer";
  document.body.appendChild(container);
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "vw";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (1.6 + Math.random() * 1.4) + "s";
    piece.style.animationDelay = (Math.random() * 0.3) + "s";
    piece.style.setProperty("--rot", Math.round(Math.random() * 360) + "deg");
    container.appendChild(piece);
  }
  setTimeout(() => container.remove(), 3200);
}

function celebrateTicket(ticket) {
  const cSel0 = ticket.selections[0];
  const label = ticket.selections.length > 1
    ? ftf("dashjs.common.accumulator", { n: ticket.selections.length })
    : (cSel0.homeTeam && cSel0.awayTeam ? `${cSel0.homeTeam} – ${cSel0.awayTeam}` : (cSel0.league || ft("dashjs.common.ticket")));
  if (ticket.status === "won") {
    showToast("win", ft("dashjs.toast.won"), `${label} · +${usd(ticket.payout - ticket.stake)}`);
    fireConfetti();
  } else if (ticket.status === "lost") {
    showToast("loss", ft("dashjs.toast.lost"), `${label} · −${usd(ticket.stake)}`);
  } else if (ticket.status === "push") {
    // voidReason = tiket nesplnil serverovou kontrolu při podání (skončený zápas, změněné kurzy…)
    showToast("push", ticket.voidReason ? ft("dashjs.toast.voided") : ft("dashjs.toast.refunded"), ticket.voidReason ? `${label} · ${srvMsg(ticket.voidReason)}` : label);
  }
}

// Po zaplacení bez přihlášení: kupující musí otevřít odkaz z e-mailu (ověření, že schránka je jeho).
function showCheckEmailNotice() {
  if (document.getElementById("checkEmailNotice")) return;
  const box = document.createElement("div");
  box.id = "checkEmailNotice";
  box.setAttribute("role", "alert");
  box.style.cssText = "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(2,2,4,.94);backdrop-filter:blur(6px)";
  box.innerHTML = '<div style="max-width:440px;text-align:center;padding:32px;border-radius:18px;background:#0b0b10;border:1px solid rgba(20,241,149,.35);font-family:Inter,Arial,sans-serif;color:#e8e8ee">' +
    '<div style="font-size:40px;margin-bottom:8px">&#9993;</div>' +
    '<h2 style="margin:0 0 10px;font-size:22px;color:#fff">' + ft("dashjs.checkEmail.title") + '</h2>' +
    '<p style="margin:0 0 18px;line-height:1.55;color:#b9b9c6">' + ft("dashjs.checkEmail.body") + '</p>' +
    '<a href="./" style="color:#14f195;text-decoration:none;font-weight:600">' + ft("dashjs.checkEmail.back") + '</a></div>';
  document.body.appendChild(box);
}

// ---------- return from Whop checkout (?paid=1) ----------
// Captured before the URL gets cleaned below — syncChallengeAccount() (runs
// later, on DOMContentLoaded) uses this to retry instead of immediately
// showing "Get an account": the whop-webhook that creates the
// challenge_accounts row can take a few seconds to arrive after Whop
// redirects back here, so the very first query can genuinely find nothing
// yet even though the payment succeeded.
const justPaid = new URLSearchParams(window.location.search).get("paid") === "1";
if (justPaid) {
  showToast("win", ft("dashjs.toast.paidTitle"), ft("dashjs.toast.paidBody"));
  // clean the parameter from the address so the toast does not pop up on refresh
  window.history.replaceState({}, "", "dashboard");
}

// ---------- badges: real conditions computed from portfolio data ----------
const BADGES = [
  // název = i18n klíč (dashjs.badge.*), překládá se až při vykreslení
  ["dashjs.badge.firstWin", "b-prvni-vitezstvi", "b-prvni-vitezstvi"],
  ["dashjs.badge.row5", "b-5-v-rade", "b-5-v-rade"],
  ["dashjs.badge.row10", "b-10-v-rade", "b-10-v-rade"],
  ["dashjs.badge.accExpert", "b-akumulator", "b-akumulator"],
  ["dashjs.badge.phase1", "b-faze-1", "b-faze-1"],
  ["dashjs.badge.phase2", "b-faze-2", "b-faze-2"],
  ["dashjs.badge.partner", "b-funded", "b-funded"],
  ["dashjs.badge.bets100", "b-100-sazek", "b-100-sazek"],
  ["dashjs.badge.hunter", "b-lovecky", "b-lovecky"],
  ["dashjs.badge.ironHand", "b-zelezna-ruka", "b-zelezna-ruka"],
  ["dashjs.badge.firstPayout", "b-prvni-vyber", "b-prvni-vyber"],
  // série disciplíny / deník / akademie / měsíc v plusu — výpočty v js/recap.js (RecapCore)
  ["dashjs.badge.discipline7", "b-disciplina-7", "b-disciplina-7"],
  ["dashjs.badge.discipline21", "b-disciplina-21", "b-disciplina-21"],
  ["dashjs.badge.journal10", "b-dennik", "b-dennik"],
  ["dashjs.badge.academy", "b-akademie", "b-akademie"],
  ["dashjs.badge.greenMonth", "b-mesic-plus", "b-mesic-plus"],
  // Ambassador vyžaduje systém doporučení hráčů, který zatím neexistuje
  // (affiliate systém dnes slouží jen content creatorům/promo kódům) — zůstává uzamčený.
  ["dashjs.badge.ambassador", "b-ambasador", null],
];

function computeStreaks(state) {
  const settled = state.tickets
    .filter((t) => t.status === "won" || t.status === "lost")
    .slice()
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt));
  let current = 0, currentType = null, bestWin = 0;
  settled.forEach((t) => {
    current = t.status === currentType ? current + 1 : 1;
    currentType = t.status;
    if (currentType === "won") bestWin = Math.max(bestWin, current);
  });
  return { current, type: currentType, bestWin };
}

function computeBadgeUnlocks(state) {
  const streaks = computeStreaks(state);
  const wonCount = state.tickets.filter((t) => t.status === "won").length;
  const hasAccumulator = state.tickets.some((t) => t.selections.length > 1);
  // Hunter instinct: won a ticket at long odds (combined >= 5.0) — hunting outsiders.
  const hasLongOddsWin = state.tickets.some((t) => t.status === "won" && t.combinedOdds >= 5);
  // Iron hand: balance dipped within 10 % of the max-loss floor at some point,
  // then recovered to over half of the drawdown range — survived a close call.
  const dd = Portfolio.drawdownInfo(state);
  const span = dd.trailing ? state.hwm - dd.floor : state.cap - dd.floor;
  const hadCloseCall = span > 0 && (state.equityHistory || []).some((p) => (p.balance - dd.floor) / span <= 0.1);
  const recovered = span > 0 && dd.pct > 50;
  const rc = window.FundlyRecap && window.FundlyRecap.core;
  const disc = rc ? rc.disciplineStreak(state.tickets, state.cap) : { current: 0, best: 0 };
  return {
    "b-prvni-vitezstvi": wonCount >= 1,
    "b-5-v-rade": streaks.bestWin >= 5,
    "b-10-v-rade": streaks.bestWin >= 10,
    "b-akumulator": hasAccumulator,
    "b-faze-1": state.phase === 2 || state.phase === "funded",
    "b-faze-2": state.phase === "funded",
    "b-funded": state.phase === "funded",
    "b-100-sazek": state.tickets.length >= 100,
    "b-lovecky": hasLongOddsWin,
    "b-zelezna-ruka": hadCloseCall && recovered,
    "b-prvni-vyber": !!state.hasPayout,
    "b-disciplina-7": disc.best >= 7,
    "b-disciplina-21": disc.best >= 21,
    "b-dennik": !!rc && rc.journalCount(state.tickets) >= 10,
    "b-akademie": !!(window.FundlyAcademy && window.FundlyAcademy.allPassed()),
    "b-mesic-plus": !!rc && rc.hasGreenMonth(state.tickets, state.cap),
  };
}

function renderBadges(state) {
  const badgeGrid = document.getElementById("badgeGrid");
  if (!badgeGrid) return;
  const unlocks = computeBadgeUnlocks(state);
  const unlockedCount = BADGES.filter(([, , key]) => key && unlocks[key]).length;
  const countEl = document.getElementById("badgeCount");
  if (countEl) countEl.textContent = `${unlockedCount} / ${BADGES.length}`;
  // odemčený odznak jde sdílet (js/share-card.js) — tlačítko; zamčený jen dlaždice s nápovědou
  badgeGrid.innerHTML = BADGES.map(([nameKey, img, key]) => {
    const name = esc(ft(nameKey));
    const hint = esc(ft(nameKey.replace("dashjs.badge.", "dashjs.badgeHint.")));
    const unlocked = key ? !!unlocks[key] : false;
    const tip = hint && !hint.startsWith("dashjs.") ? `${name} — ${hint}` : name;
    return unlocked
      ? `<button type="button" class="badge-tile unlocked" title="${tip}" data-share="badge" data-badge-key="${img}" data-badge-name="${name}">
      <img src="assets/badges/${img}.png" alt="" />${name}
    </button>`
      : `<button type="button" class="badge-tile" title="${tip}" data-badge-hint="${hint && !hint.startsWith("dashjs.") ? hint : ""}" data-badge-name="${name}">
      <img src="assets/badges/${img}.png" alt="" />${name}
    </button>`;
  }).join("");
  renderDisciplineStreak(state);
  announceNewBadges(state, unlocks);
}

// zamčený odznak: ťuknutí ukáže, jak ho získat (title na telefonu nefunguje)
document.addEventListener("click", (e) => {
  const tile = e.target.closest && e.target.closest("[data-badge-hint]");
  if (!tile || !tile.dataset.badgeHint) return;
  // jen dočasná bublina — showToast() by nápovědu zapsal i do zvonečku notifikací
  const layer = document.getElementById("toastLayer");
  if (!layer) return;
  layer.querySelectorAll(".toast-hint").forEach((x) => x.remove());
  const el = document.createElement("div");
  el.className = "toast toast-pend toast-hint";
  el.innerHTML = `<div class="toast-title">${esc(tile.dataset.badgeName)}</div><div class="toast-detail">${esc(tile.dataset.badgeHint)}</div>`;
  layer.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 3800);
});

// série disciplíny nad mřížkou odznaků (pravidla dne: js/recap.js)
function renderDisciplineStreak(state) {
  const el = document.getElementById("discStreak");
  const rc = window.FundlyRecap && window.FundlyRecap.core;
  if (!el || !rc || !state) return;
  const d = rc.disciplineStreak(state.tickets, state.cap);
  const next = d.best >= 21 ? null : d.best >= 7 ? 21 : 7;
  const pct = next ? Math.min(100, Math.round((d.current / next) * 100)) : 100;
  el.innerHTML = `<div class="disc-streak-row">
      <span>${esc(ft("rc.streakNow"))}</span>
      <b>${esc(window.FundlyRecap.plural("rc.streakDays", d.current))}</b>
    </div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <p class="t-meta">${esc(next ? ftf("dashjs.discNext", { n: next, best: d.best }) : ftf("rc.streakBest", { n: d.best }))} · ${esc(ft("rc.discHelp"))}</p>
    <p class="t-meta">${esc(ft("share.badgeHint"))}</p>`;
}

// Oznámení nově odemčených odznaků (i mimo vyhodnocení tipů — podání tipu, kvíz v akademii).
// Pamatuje si už ohlášené odznaky pro účet v localStorage; první načtení na zařízení (nebo
// placeholder bez accountId) jen uloží stav bez toastů, ať se po obnově ze serveru neohlásí vše.
function announceNewBadges(state, unlocks) {
  if (!state || !state.accountId) return;
  const key = `fundly:badges-seen:${state.accountId}`;
  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { seen = null; }
  const now = BADGES.filter(([, , k]) => k && unlocks[k]).map(([, , k]) => k);
  if (Array.isArray(seen)) {
    const fresh = BADGES.filter(([, , k]) => k && unlocks[k] && !seen.includes(k));
    fresh.slice(0, 3).forEach(([nameKey]) => showToast("badge", ft("dashjs.toast.newBadge"), ft(nameKey)));
  }
  const merged = [...new Set([...(Array.isArray(seen) ? seen : []), ...now])];
  try { localStorage.setItem(key, JSON.stringify(merged)); } catch (e) { /* bez localStorage bez oznámení */ }
}

// ---------- overview: momentum/streak under the header ----------
function renderMomentum(state) {
  const el = document.getElementById("ovMomentum");
  if (!el) return;
  const streaks = computeStreaks(state);
  if (streaks.current < 2) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  if (streaks.type === "won") {
    el.textContent = ftf("dashjs.momentum.wins", { n: streaks.current });
    el.classList.remove("chip-momentum-cold");
  } else {
    el.textContent = ftf("dashjs.momentum.losses", { n: streaks.current });
    el.classList.add("chip-momentum-cold");
  }
}

// ---------- portfolio: boots the simulation and settles tickets periodically ----------
// Zaznamenat PŘED Portfolio.ensure() níž, jestli lokální stav existoval už
// před touto návštěvou — ensure() ho vzápětí sám založí, kdyby chyběl, a
// syncChallengeAccount() dole potřebuje umět odlišit "opravdový starý
// postup" od "prázdný placeholder co jsme si sami před chvílí vytvořili",
// jinak se restore ze serveru nikdy nespustí (viz Portfolio.restore()).
const hadLocalPortfolioBeforeBoot = !!Portfolio.get();
Portfolio.ensure("advanced");
renderBadges(Portfolio.get());
// akademie (js/academy.js) načte postup ze Supabase až po startu → odznak "Absolvent akademie"
document.addEventListener("fundly:academy-progress", () => renderBadges(Portfolio.get()));

async function refreshAfterSettlement() {
  const beforeState = Portfolio.get();
  const beforeStatus = beforeState ? Object.fromEntries(beforeState.tickets.map((t) => [t.id, t.status])) : {};

  await Portfolio.checkSettlements();

  const afterState = Portfolio.get();
  if (afterState) {
    afterState.tickets.forEach((t) => {
      if (beforeStatus[t.id] === "pending" && t.status !== "pending") {
        celebrateTicket(t);
      }
    });
    // nové odznaky ohlásí renderBadges() → announceNewBadges()
    renderBadges(afterState);
    renderMomentum(afterState);
    // právě teď splnil cíl fáze — betting se pozastaví, dokud to neschválí admin
    if (!beforeState?.pendingPhase && afterState.pendingPhase) {
      showToast("pend", ft("dashjs.toast.phaseReached"), ft("dashjs.toast.phaseReachedBody"));
    }
  }

  if (typeof renderPrehled === "function") renderPrehled();
  if (typeof renderVykon === "function") renderVykon();
  if (typeof renderBankBar === "function") renderBankBar();
  if (typeof scheduleAccountSync === "function") scheduleAccountSync();
}
refreshAfterSettlement();
setInterval(refreshAfterSettlement, 5 * 60 * 1000);

// ---------- server sync stavu účtu (jen přihlášený uživatel, fire-and-forget) ----------
// Snapshot je stavěn ze stejných helperů jako UI (drawdownInfo, kvalifikační
// tikety, summary), takže admin vidí přesně to, co hráč. Debounce: trailing
// 2 s, max 1 volání / 5 s. Chyby se polykají — sync nikdy neblokuje UI.
let syncTimer = null;
let lastSyncAt = 0;

// ---------- „AI-style" risk check: transparentní pravidelné skóre 0–100 ----------
// Deterministické a vysvětlitelné (žádná externí AI) — váhy jednotlivých
// pravidel níže; důvody se zobrazují v admin detailu hráče.
function computeRisk(state, s) {
  let score = 0;
  const reasons = [];
  const arb = state.tickets.filter((t) => (t.flags || []).includes("arbitrage")).length;
  const val = state.tickets.filter((t) => (t.flags || []).includes("value")).length;
  if (arb) { score += Math.min(60, arb * 40); reasons.push(`${arb}× tiket s arbitráží / sure bettingem`); }
  // Value z vlastní analýzy je dovolené (pravidla čl. 6) — signál jen při SYSTEMATICKÉM tipování
  // kurzů, které zdroj označil jako chybné / zpožděné (≥ 5 tipů a ≥ polovina všech tipů hráče).
  const allTips = state.tickets.length;
  if (val >= 5 && val / Math.max(1, allTips) >= 0.5) {
    score += 30;
    reasons.push(`${val}/${allTips} tipů na kurzech, které zdroj označil jako chybné či zpožděné — přezkoumat`);
  }
  if (s.total >= 5 && s.avgOdds > 4) {
    score += 10;
    reasons.push(`průměrný kurz outlier (${s.avgOdds.toFixed(2)})`);
  }
  if (s.total >= 5 && state.tickets.every((t) => t.stake >= Portfolio.ruleMeta(state).maxStake * 0.98)) {
    score += 15;
    reasons.push("všechny tikety na max. sázku");
  }
  // pokrytí stejného zápasu napříč tikety (>2 výběry na jednu událost)
  const evCount = {};
  state.tickets.forEach((t) => t.selections.forEach((x) => {
    evCount[x.eventId] = (evCount[x.eventId] || 0) + 1;
  }));
  if (Object.values(evCount).some((c) => c > 2)) {
    score += 15;
    reasons.push("opakované pokrytí stejného zápasu");
  }
  // HIGH_WIN_RATE je INFO — jen kontext vedle jiných nálezů, samo o sobě
  // do skóre nepřičítá (vysoký winrate může být prostě skill).
  if (s.won + s.lost >= 10 && s.winRate > 85) {
    reasons.push(`INFO HIGH_WIN_RATE (${s.winRate} %)`);
  }
  // rapid-fire: 5+ tiketů během 10 minut
  const times = state.tickets.map((t) => new Date(t.placedAt).getTime()).sort((a, b) => a - b);
  for (let i = 0; i + 4 < times.length; i++) {
    if (times[i + 4] - times[i] <= 10 * 60 * 1000) {
      score += 10;
      reasons.push("rapid-fire tikety (5+ během 10 minut)");
      break;
    }
  }
  return { score, reasons };
}

function buildAccountSnapshot(state) {
  const s = Portfolio.summary(state);
  const breach = Portfolio.breachInfo(state);
  const breached = breach.breached;
  const flags = [...new Set(state.tickets.flatMap((t) => t.flags || []))];
  const risk = computeRisk(state, s);
  // kompaktní sázkový profil pro admin analytiku (top sporty/ligy, průměry)
  const bySport = {};
  const byLeague = {};
  state.tickets.forEach((t) => t.selections.forEach((sel) => {
    if (sel.sport) bySport[sel.sport] = (bySport[sel.sport] || 0) + 1;
    if (sel.league) byLeague[sel.league] = (byLeague[sel.league] || 0) + 1;
  }));
  const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => ({ name, count }));
  return {
    phase: state.phase === "funded" ? 3 : state.phase,
    state: breached ? "breached" : state.pendingPhase ? "pending_approval" : state.phase === "funded" ? "funded" : "active",
    pendingPhase: state.pendingPhase ? (state.pendingPhase === "funded" ? 3 : state.pendingPhase) : null,
    balance: state.balance,
    profit: state.balance - state.cap,
    qualifyingTickets: Portfolio.countQualifyingTickets(state, state.phaseStartedAt),
    breachReason: breached ? breach.reason : null,
    flags,
    ticketsTotal: s.total,
    ticketsWon: s.won,
    riskScore: risk.score,
    riskReasons: risk.reasons,
    // pro věrnou obnovu stavu, kdyby klientovi zmizel localStorage (viz
    // restore-account) — beze změny logiky vyhodnocování pravidel.
    hwm: state.hwm,
    phaseBaseline: state.phaseBaseline,
    phaseStartedAt: state.phaseStartedAt,
    dayStartDate: state.dayStartDate,
    dayStartBalance: state.dayStartBalance,
    lastPayoutAt: state.lastPayoutAt,
    bettingProfile: {
      topSports: top(bySport),
      topLeagues: top(byLeague),
      avgStake: s.total ? Math.round(s.staked / s.total) : 0,
      avgOdds: Math.round(s.avgOdds * 100) / 100,
    },
  };
}

function scheduleAccountSync() {
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncAccountNow, 2000);
}

async function syncAccountNow() {
  const wait = 5000 - (Date.now() - lastSyncAt);
  if (wait > 0) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncAccountNow, wait);
    return;
  }
  await pushAccountSnapshot();
}

// Bez debounce — voláno přímo při odhlášení, ať se poslední sázka/tiket
// vždycky stihne dostat na server dřív, než se zavře session. Bez tohohle
// mohl hráč vsadit a hned se odhlásit dřív, než uplynulo okno debounce
// (2-7 s) v syncAccountNow(), takže se poslední tiket nikdy neuložil a
// na jiném zařízení/prohlížeči pak vypadal, jako by "zmizela historie".
async function pushAccountSnapshot() {
  lastSyncAt = Date.now();
  try {
    const client = await FundlyBackend.getClient();
    if (!client) return;
    const { data } = await client.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return; // demo režim / nepřihlášený
    const state = Portfolio.get();
    if (!state) return;

    // Tikety se musí zasynchronizovat PRVNÍ, teprve pak zůstatek — sync-account
    // si zůstatek dopočítává i samo (viz jeho balanceRejected kontrola) přesně
    // z toho, co je v tabulce tickets, takže dokud by tam nejnovější tiket
    // ještě nebyl, vlastní čerstvá výhra/sázka by se serveru zdála podezřelá
    // a zůstatek by se omylem odmítl.
    if (state.tickets && state.tickets.length) {
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/sync-tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          tickets: state.tickets.slice(0, 200).map((t, i) => ({
            id: t.id,
            selections: t.selections,
            stake: t.stake,
            combinedOdds: t.combinedOdds,
            status: t.status,
            placedAt: t.placedAt,
            settledAt: t.settledAt,
            payout: t.payout,
            // Deník tipů (migrace 041): poznámku posíláme jen u 50 nejnovějších tiketů
            // (keepalive tělo má limit 64 kB); starší už server má a bez pole je nepřepíše.
            ...(i < 50 && t.note ? { note: t.note } : {}),
            ...(i < 50 && Array.isArray(t.noteTags) && t.noteTags.length ? { noteTags: t.noteTags } : {}),
          })),
        }),
        keepalive: true,
      });
      const data = await res.json().catch(() => ({}));

      // server-side pojistka (settle-tickets cron, nebo teď i sync-tickets
      // samo) mohla vyhodnotit tikety jinak, než si klient myslel — promítne
      // se to hned do zůstatku a ukáže stejnou oslavu/toast jako u lokálního
      // vyhodnocení.
      if (Array.isArray(data.settled) && data.settled.length) {
        const newlySettled = Portfolio.applyServerSettlements(data.settled);
        if (newlySettled && newlySettled.length) {
          newlySettled.forEach((t) => { if (typeof celebrateTicket === "function") celebrateTicket(t); });
          const fresh = Portfolio.get();
          if (fresh) {
            if (typeof renderBadges === "function") renderBadges(fresh);
            if (typeof renderMomentum === "function") renderMomentum(fresh);
          }
          if (typeof renderPrehled === "function") renderPrehled();
          if (typeof renderVykon === "function") renderVykon();
          if (typeof renderBankBar === "function") renderBankBar();
        }
      }
    }

    // keepalive: prohlížeč se pokusí request dokončit, i kdyby stránka
    // mezitím zavřela/navigovala pryč (přesně hlášený případ: vsadit a
    // hned zavřít kartu) — bez toho by fetch zůstal viset a odpadl.
    const freshState = Portfolio.get() || state;
    const syncRes = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/sync-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildAccountSnapshot(freshState)),
      keepalive: true,
    });
    // Zaznamenat, kdy tohle zařízení naposled úspěšně poslalo svůj stav —
    // syncChallengeAccount() to porovnává se serverovým synced_at, aby
    // poznalo, jestli mezitím nepřibyla novější verze z JINÉHO zařízení
    // (viz jeho serverHasNewerData). Bez tohohle by po vlastním pushi
    // zůstal syncedAt starý navěky a každá další kontrola by tenhle push
    // omylem vyhodnotila jako "cizí novější data".
    if (syncRes.ok) {
      const fresh = Portfolio.get();
      if (fresh && fresh.accountId === freshState.accountId) {
        fresh.syncedAt = new Date().toISOString();
        Portfolio.save(fresh);
      }
    }
  } catch (e) { /* sync je best-effort */ }
}

// Poslední pojistka: hráč nemusí kliknout na Log out vůbec — zavře kartu,
// přepne appku na mobilu, nebo naviguje jinam. "pagehide" se spustí ve
// všech těchto případech (na rozdíl od "beforeunload", který moderní
// mobilní prohlížeče při přepnutí appky nespolehlivě volají) — keepalive
// výš dá požadavku šanci doběhnout, i když stránka mezitím zmizí.
window.addEventListener("pagehide", () => {
  if (typeof pushAccountSnapshot === "function") pushAccountSnapshot();
});

// při načtení dashboardu (případně přihlášeného) rovnou naplánujeme sync
scheduleAccountSync();

// ---------- limited dashboard: přihlášený uživatel bez aktivního účtu ----------
// Overview zůstane na CTA "koupit balíček" + historie starých účtů, ale
// navigace zůstává funkční — hráč si může projít i zbytek dashboardu
// (hlavně Entries: reálné zápasy a kurzy) bez placení. Skutečné podání
// tiketu je zablokované (window.__noRealAccount, viz placeBet handler a
// previewModePanel v Entries).
// Sdílené mezi showLimitedDashboard (žádný aktivní účet) a renderProfile
// (aktivní účet, "Your account history" panel) — stejný řádek pro oba.
function accountHistoryRowsHtml(accounts) {
  const label = (s) => (["funded", "active", "pending_approval", "breached"].includes(s) ? ft(`dashjs.accState.${s}`) : s);
  const tag = (s) => s === "funded" ? "win" : (s === "active" || s === "pending_approval") ? "push" : "loss";
  return accounts.map((a) => `
    <div class="k-row neutral">${a.package_key || "?"} · $${Number(a.capital || 0).toLocaleString("en-US")}
      <span class="n"><span class="tag ${tag(a.state)}">${label(a.state)}</span>
      <span style="color:var(--text-muted);font-size:.75rem">${new Date(a.created_at).toLocaleDateString(uiLocale())}</span></span>
    </div>`).join("");
}

function showLimitedDashboard(accounts) {
  document.body.classList.add("limited");
  window.__noRealAccount = true;
  window.FundlyPromo?.setActivePlayer(false); // bez aktivního účtu → sleva na nákup / reset dává smysl
  document.querySelectorAll(".buy-challenge-cta").forEach((btn) => { btn.hidden = false; });
  document.querySelectorAll(".dash-view").forEach((v) => { v.hidden = true; });
  const view = document.getElementById("view-noaccount");
  if (view) view.hidden = false;
  const pastPanel = document.getElementById("naPastPanel");
  if (pastPanel) pastPanel.hidden = !accounts.length;
  // Hodnota i po neúspěchu: poplatek kupuje přístup k platformě na 30 dní (Akademie, novinky) —
  // po spálení účtu zůstává přístup do konce těch 30 dní od začátku poslední výzvy.
  const accessPanel = document.getElementById("naAccessPanel");
  if (accessPanel) {
    const until = accounts.reduce((m, a) => {
      const from = new Date(a.phase_started_at || a.created_at).getTime();
      return Number.isFinite(from) ? Math.max(m, from + 30 * 864e5) : m;
    }, 0);
    accessPanel.hidden = !(until > Date.now());
    if (until > Date.now()) {
      document.getElementById("naAccessText").textContent = ftf("dashjs.news.accessUntil", {
        date: new Date(until).toLocaleDateString(newsLang() === "cs" ? "cs-CZ" : "en-GB", { day: "numeric", month: "long", year: "numeric" }),
      });
    }
  }
  const list = document.getElementById("naAccounts");
  if (list && accounts.length) list.innerHTML = accountHistoryRowsHtml(accounts);
  showResetOfferFromAccounts(accounts);
}


// ---------- reset po spálení účtu (40 % z ceny balíčku, terms §4.5) ----------
// Nabídka se ukáže hned po spálení: v Overview (živě, ještě než se to stihne
// zapsat na server) i v "no account" dashboardu po dalším načtení. Server
// (whop-checkout, reset: true) znovu ověří, že e-mail má spálený účet stejného
// balíčku bez použitého resetu — tlačítko tu jen otevře platbu.
function resetOfferText(pkgKey) {
  const pkg = packageByKey(pkgKey);
  const price = packageMeta(pkg).resetFee;
  return { pkg, price, text: ftf("dashjs.reset.offer", { name: pkg.name, price: usd(price), full: usd(pkg.price) }) };
}

// Tlačítko resetu šlo stisknout jen jednou: po kliknutí zůstalo "disabled" — když se hráč
// z platební brány vrátil zpět (prohlížeč obnoví stránku z paměti i se zablokovaným
// tlačítkem), nebo když se některý krok před přesměrováním zasekl. Teď se tlačítko vždy
// uvolní: po chybě, po návratu zpět (pageshow), a pojistkou, kdyby přesměrování neproběhlo.
async function startAccountReset(pkgKey, btn, note) {
  if (btn.dataset.busy === "1") return; // dvojklik
  btn.dataset.busy = "1";
  btn.disabled = true;
  note.hidden = true;
  const label = btn.textContent;
  btn.dataset.label = label;
  btn.textContent = ft("dashjs.reset.opening");
  const release = () => { btn.disabled = false; btn.dataset.busy = ""; btn.textContent = label; };
  try {
    // živě spálený účet se na server dostane až syncem — počkat, ať je "breached" už zapsané
    // (max. 5 s — pomalá síť nesmí tlačítko zablokovat)
    if (typeof pushAccountSnapshot === "function") {
      await Promise.race([pushAccountSnapshot().catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
    }
    const user = await FundlyAuth.getUser();
    if (!user || !user.email) throw new Error(ft("dashjs.common.signInAgain"));
    const data = await FundlyCheckout.createSession(pkgKey, user.email, { reset: true });
    window.location.href = data.checkoutUrl;
    setTimeout(release, 8000); // přesměrování neproběhlo (zablokované / zrušené) → znovu použitelné
  } catch (err) {
    note.textContent = err.message || ft("dashjs.common.gatewayError");
    note.className = "auth-note mt error";
    note.hidden = false;
    release();
  }
}
// návrat z platební brány tlačítkem Zpět: stránka z paměti prohlížeče (bfcache) → uvolnit tlačítka
window.addEventListener("pageshow", (e) => {
  if (!e.persisted) return;
  const act = document.getElementById("activationPay"); // platba aktivace má stejný vzor
  if (act) act.disabled = false;
  ["breachResetBtn", "naResetBtn"].forEach((id) => {
    const b = document.getElementById(id);
    if (b && b.dataset.busy === "1") { b.disabled = false; b.dataset.busy = ""; if (b.dataset.label) b.textContent = b.dataset.label; }
  });
  updateBreachPanel(); // obnoví i popisek tlačítka
});

function wireResetPanel(panelId, textId, btnId, noteId, pkgKey) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const offer = resetOfferText(pkgKey);
  document.getElementById(textId).textContent = offer.text;
  const btn = document.getElementById(btnId);
  btn.textContent = ftf("dashjs.reset.btn", { price: usd(offer.price) });
  btn.onclick = () => startAccountReset(pkgKey, btn, document.getElementById(noteId));
  panel.hidden = false;
}

// živě: lokální stav je spálený (denní/celková ztráta), účet je ale na serveru ještě "active"
function updateBreachPanel() {
  const panel = document.getElementById("breachPanel");
  if (!panel || window.__noRealAccount) return;
  const state = Portfolio.get();
  if (!state || !state.accountId || !Portfolio.breachInfo(state).breached) { panel.hidden = true; return; }
  wireResetPanel("breachPanel", "breachPanelText", "breachResetBtn", "breachResetNote", state.packageKey);
}

// po načtení: žádný aktivní účet, ale nejnovější spálený účet má nevyužitý reset
function showResetOfferFromAccounts(accounts) {
  const breached = accounts.find((a) => a.state === "breached" && !(Array.isArray(a.flags) && a.flags.includes("reset_used")));
  if (breached && packageByKey(breached.package_key).key === breached.package_key) {
    wireResetPanel("naResetPanel", "naResetText", "naResetBtn", "naResetNote", breached.package_key);
  }
}

// ---------- activation fee: panel pro funded účet bez zaplacené aktivace ----------
function showActivationPanel(email) {
  const panel = document.getElementById("activationPanel");
  if (!panel) return;
  panel.hidden = false;
  document.getElementById("activationPay").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const data = await FundlyCheckout.createSession("activation", email);
      window.location.href = data.checkoutUrl;
    } catch (err) {
      const note = document.getElementById("activationNote");
      note.textContent = err.message || ft("dashjs.common.gatewayError");
      note.className = "auth-note mt error";
      note.hidden = false;
      btn.disabled = false;
    }
  });
}

// ---------- Supabase: loading the real challenge account ----------
// For a signed-in user we take the package over from the paid order
// (row ownership is guarded by RLS in the database). Without a backend or
// sign-in nothing changes and the dashboard keeps running on localStorage.
async function syncChallengeAccount() {
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) return;
  try {
    const client = await FundlyBackend.getClient();
    if (!client) return;
    const user = await FundlyAuth.getUser();
    // Gate: dashboard je jen pro platící — bez přihlášení na landing,
    // bez jakéhokoli účtu na checkout, bez aktivního účtu limited dashboard.
    if (!user) {
      // Právě zaplaceno, ale v tomhle prohlížeči není přihlášení (účet s touto adresou už existoval
      // a e-mail se neověřuje — přihlásit se musí odkazem z "Payment confirmed" e-mailu, viz
      // whop-webhook / _shared/mailbox.ts). Neposílat domů, ať kupující ví, co dál.
      if (justPaid) { showCheckEmailNotice(); return; }
      window.location.replace("./");
      return;
    }
    const fetchAccounts = async () => {
      const { data, error: fetchError } = await client
        .from("challenge_accounts")
        .select("id, package_key, capital, phase, pending_phase, pending_requested_at, state, flags, created_at, phase_started_at, inactivity_warned_7, inactivity_warned_13, nickname, leaderboard_opt_in, synced_at, phase_bonus_days")
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      return data || [];
    };

    let accounts;
    try {
      accounts = await fetchAccounts();
    } catch (e) {
      return;
    }
    lastFetchedAccounts = accounts;
    // Přihlášený uživatel bez aktivního (active/funded) účtu — ať už nikdy
    // žádný nekoupil, nebo mu poslední spálili/skončil — vždycky dostane
    // tenhle limited dashboard (platební brána + nastavení účtu + historie
    // starých účtů), ne tvrdý redirect na checkout. Dřív se bez jakéhokoli
    // řádku v challenge_accounts posílalo rovnou na checkout a přeskočila
    // se stránka, kde přihlášený člověk vidí svoje údaje.
    // pending_approval = fáze splněná, čeká na schválení adminem — pořád je
    // to plnohodnotně "má aktivní účet", jen se dočasně nesází (viz
    // Portfolio.placeBet()), takže patří do stejné podmínky jako active/funded.
    let account = accounts.find((a) => a.state === "active" || a.state === "funded" || a.state === "pending_approval");

    // Čerstvě zaplaceno (?paid=1), ale whop-webhook ještě nestihl založit
    // challenge_accounts řádek (obvykle pár sekund po platbě) — bez tohohle
    // hráč hned po zaplacení uvidí "Get an account" místo svého nového účtu
    // a klidně by si omylem koupil druhý. Pár krátkých pokusů místo
    // okamžitého vzdání se.
    if (!account && justPaid) {
      for (let attempt = 0; attempt < 4 && !account; attempt++) {
        await new Promise((r) => setTimeout(r, 2500));
        try {
          accounts = await fetchAccounts();
          lastFetchedAccounts = accounts;
        } catch (e) {
          break;
        }
        account = accounts.find((a) => a.state === "active" || a.state === "funded" || a.state === "pending_approval");
      }
    }

    pendingApprovalSince = account?.pending_requested_at ?? null;

    if (!account) {
      showLimitedDashboard(accounts);
      if (isPasswordRecovery) jumpToPasswordSettings("na");
      return;
    }

    // A real account was found — undo everything showLimitedDashboard() set,
    // in case this page load transiently hit the no-account branch first
    // (e.g. a slow initial fetch right after paying, before the justPaid
    // retry above catches up) before finding the real one. Without this,
    // "Buy a Challenge" would keep showing for the rest of the session even
    // once an already-active account loads — and, worse, __noRealAccount
    // would keep silently blocking bet placement (see the placeBet handler)
    // for an account that's actually real and active.
    document.querySelectorAll(".buy-challenge-cta").forEach((btn) => { btn.hidden = true; });
    document.body.classList.remove("limited");
    window.__noRealAccount = false;
    window.FundlyPromo?.setActivePlayer(true); // aktivní hráč slevový banner nepotřebuje

    // Bonusové dny k lhůtě fáze (kompenzace výpadku zdroje kurzů apod.) drží server
    // — admin je přidá SQL/migrací a klient je jen zobrazuje. Zařízení s už existujícím
    // lokálním stavem by se jinak k bonusu nikdy nedostalo (syncChallengeAccount níž se
    // při shodné fázi a synced_at vrací dřív, než by stav obnovil ze serveru).
    {
      const localState = Portfolio.get();
      const serverBonus = Number(account.phase_bonus_days) || 0;
      if (localState && localState.accountId === account.id && (Number(localState.bonusDays) || 0) !== serverBonus) {
        const added = serverBonus - (Number(localState.bonusDays) || 0);
        localState.bonusDays = serverBonus;
        Portfolio.save(localState);
        if (typeof renderPrehled === "function") renderPrehled();
        if (typeof renderVykon === "function") renderVykon();
        if (typeof renderBankBar === "function") renderBankBar();
        if (added > 0) {
          showToast("win", ftp("dashjs.toast.bonusDays", added), ft("dashjs.toast.bonusDaysBody"));
        }
      }
    }

    // Purchase conversion pixel — fires once, only on the actual return trip
    // from Whop (?paid=1, already stripped from the URL above so a refresh
    // can't refire it). Uses the package's list price: the client has no RLS
    // access to the real charged amount in `payments` (service-role only),
    // so this doesn't reflect a promo code the buyer may have applied at
    // Whop's checkout — still far better than no Purchase signal at all,
    // which is what Meta/Google were getting before this.
    if (justPaid) {
      const pkg = packageByKey(account.package_key);
      // Hodnota = cena po slevě, kterou web ukazuje (promoPrice); skutečnou zaplacenou
      // částku klient nezná — přesnou hodnotu posílá server-side CAPI z webhooku,
      // které Meta spojí přes stejné eventID (deduplikace).
      const paidValue = typeof promoActive === "function" && promoActive() ? promoPrice(pkg.price) : pkg.price;
      let purchaseEventId = null;
      try { purchaseEventId = localStorage.getItem("fundly:purchaseEventId"); localStorage.removeItem("fundly:purchaseEventId"); } catch (e) { /* ignore */ }
      if (typeof fbq === "function") {
        fbq("track", "Purchase", {
          value: paidValue,
          currency: "USD",
          content_ids: [account.package_key],
          content_name: pkg.name,
          content_type: "product",
        }, purchaseEventId ? { eventID: purchaseEventId } : undefined);
      }
      if (typeof gtag === "function") {
        gtag("event", "purchase", {
          transaction_id: account.id,
          value: paidValue,
          currency: "USD",
          items: [{ item_id: account.package_key, item_name: pkg.name, price: pkg.price, quantity: 1 }],
        });
      }
    }

    // leaderboard nastavení: naplnit z reálného účtu (přepíšou HTML placeholder)
    const nickInputEl = document.getElementById("nickInput");
    if (nickInputEl && account.nickname) nickInputEl.value = account.nickname;
    const lbShareEl = document.getElementById("lbShare");
    if (lbShareEl) lbShareEl.setAttribute("aria-checked", String(account.leaderboard_opt_in !== false));

    // funded účet bez zaplaceného aktivačního poplatku → nápadný panel
    const accFlags = Array.isArray(account.flags) ? account.flags : [];
    if (account.state === "funded" && !accFlags.includes("activation_paid")) {
      showActivationPanel(user.email);
    }

    // neaktivita: min. 1 tiket / 14 dní na funded účtu, jinak se účet spálí
    // (viz account-maintenance cron) — banner podle posledního varování.
    if (account.state === "funded" && account.inactivity_warned_13) {
      showToast("loss", ft("dashjs.toast.lastWarn"), ft("dashjs.toast.lastWarnBody"));
    } else if (account.state === "funded" && account.inactivity_warned_7) {
      showToast("pend", ft("dashjs.toast.stayActive"), ft("dashjs.toast.stayActiveBody"));
    }

    if (isPasswordRecovery) jumpToPasswordSettings("s");

    const state = Portfolio.get();
    // "existoval už PŘED touto návštěvou" musí platit taky — Portfolio.ensure()
    // o pár řádků výš (spouští se na každé načtení dashboardu, ať je backend
    // synchronizovaný nebo ne) jinak sám založí prázdný placeholder na
    // defaultním "advanced" balíčku, který by tu vypadal jako "lokální stav
    // je v pořádku" a restore ze serveru by se nikdy nespustil — čerstvý
    // prohlížeč/zařízení by tak pokaždé vypadal jako čerstvě založený účet
    // s nulovou historií, i když server reálný postup má.
    //
    // Porovnávat se MUSÍ i accountId, ne jen packageKey: jinak leftover local
    // state z jiného účtu/testu se stejným balíčkem (např. "starter" zůstalý
    // v localStorage z dřívějšího testování) projde jako "je to v pořádku" a
    // nový zákazník po zaplacení uvidí cizí/starou historii tiketů místo
    // čerstvého účtu. Reálný root cause incidentu 29.8. — nový nákup, hned
    // zobrazená historie 47 tiketů z předchozího testu na stejném prohlížeči.
    // Fáze/schvalování je autoritativní na serveru (viz approve-phase) —
    // pokud se admin mezitím rozhodl (schválil/zamítl) a lokální stav o tom
    // ještě neví (zařízení bylo zavřené), musí se přeskočit i "je to v
    // pořádku" zkratka výš a spustit obnova ze serveru níž, jinak by hráč
    // dál viděl starou fázi / "čeká na schválení" navěky.
    const localPhaseNum = state ? (state.phase === "funded" ? 3 : state.phase) : null;
    const localPendingNum = state && state.pendingPhase ? (state.pendingPhase === "funded" ? 3 : state.pendingPhase) : null;
    const serverPendingNum = account.pending_phase ?? null;
    const wasWaitingForApproval = localPendingNum != null;
    const phaseInSync = localPhaseNum === account.phase && localPendingNum === serverPendingNum;
    // Souhlasná fáze NEZNAMENÁ souhlasný stav: vsazení tiketu na jiném
    // zařízení mění balance/tikety, ne fázi, takže samotné phaseInSync tenhle
    // případ nikdy nezachytí — hráč, co vsadí na mobilu a otevře/obnoví
    // dashboard na PC (stejná fáze), by tu navěky viděl starý zůstatek a
    // chyběj­ící tiket (reálně nahlášeno 21.9.). synced_at se na serveru
    // nastavuje na KAŽDÝ push z libovolného zařízení (viz sync-account), takže
    // "server má novější synced_at, než jsme si naposled sami zaznamenali"
    // je spolehlivý signál, že mezitím přibyla data z jiného zařízení.
    // +3s rezerva pokrývá drobný rozjel mezi klientskými a serverovými hodinami
    // kolem vlastního právě odeslaného pushe (viz pushAccountSnapshot).
    const serverSyncedAtMs = account.synced_at ? new Date(account.synced_at).getTime() : 0;
    const localSyncedAtMs = state && state.syncedAt ? new Date(state.syncedAt).getTime() : 0;
    const serverHasNewerData = serverSyncedAtMs > localSyncedAtMs + 3000;
    if (state && state.accountId && state.accountId === account.id && hadLocalPortfolioBeforeBoot && phaseInSync && !serverHasNewerData) return;

    // Lokální stav chybí nebo neodpovídá zaplacenému balíčku — nejdřív
    // zkusit obnovit reálný postup ze serveru (localStorage může zmizet
    // nezávisle na tom, co má hráč reálně rozehrané: Safari maže data
    // po ~7 dnech neaktivity, soukromé okno, jiné zařízení/prohlížeč).
    // Teprve když server nemá co obnovit (úplně nový účet, žádný sync
    // v historii), založí se čerstvá simulace od nuly.
    let restored = null;
    try {
      const { data: sessionData } = await client.auth.getSession();
      const token = sessionData && sessionData.session && sessionData.session.access_token;
      if (token) {
        const fetchRestore = () => fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/restore-account`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).then((r) => r.json()).catch(() => ({}));
        let data = await fetchRestore();
        // Souběh víc zařízení na stejném účtu: nejde jen o obnovu na
        // NOVÉM zařízení, hráči tady reálně přepínají mezi dvěma otevřenými
        // okny/profily se stejným účtem. Pokud první tiket na zařízení A
        // ještě nestihl doběhnout na server (sync teď trvá ~1s), zařízení B
        // by tu vidělo "nic k obnovení" a založilo by si čerstvý účet — a
        // ten by se vzápětí sám nahrál na server a přepsal reálný postup
        // zařízení A. Jedno krátké opakování těsně pod tou 1s hranicí
        // pokryje naprostou většinu těchhle "sotva to minulo" případů.
        if (!data.account) {
          await new Promise((r) => setTimeout(r, 1500));
          data = await fetchRestore();
        }
        if (data.account) restored = Portfolio.restore(data.account, data.tickets);
      }
    } catch (e) { /* restore je best-effort, spadneme zpátky na init() */ }

    if (restored) {
      if (typeof renderPrehled === "function") renderPrehled();
      if (typeof renderVykon === "function") renderVykon();
      if (typeof renderBankBar === "function") renderBankBar();
      if (wasWaitingForApproval && account.state === "pending_approval") {
        // pořád čeká — sem se dostane jen když se localStorage mezitím ztratil
        showToast("pend", ft("dashjs.toast.awaiting"), ft("dashjs.toast.awaitingBody"));
      } else if (wasWaitingForApproval && account.state === "funded") {
        showToast("win", ft("dashjs.toast.funded"), ft("dashjs.toast.fundedBody"));
      } else if (wasWaitingForApproval && account.phase === localPendingNum) {
        showToast("win", ftf("dashjs.toast.phaseApproved", { n: account.phase }), ft("dashjs.toast.phaseApprovedBody"));
      } else if (wasWaitingForApproval) {
        showToast("pend", ft("dashjs.toast.backToTrading"), ft("dashjs.toast.backToTradingBody"));
      } else {
        showToast("win", ft("dashjs.toast.restored"), ft("dashjs.toast.restoredBody"));
      }
      return;
    }

    // the paid package differs from the local one → boot the simulation with it
    Portfolio.init(account.package_key, account.id);
    if (typeof renderPrehled === "function") renderPrehled();
    if (typeof renderVykon === "function") renderVykon();
    if (typeof renderBankBar === "function") renderBankBar();
    showToast("win", ft("dashjs.toast.active"), ftf("dashjs.toast.activeBody", { name: packageByKey(account.package_key).name }));
  } catch (e) {
    // silent fallback to local data
  }
}
// js/config.js and js/whop.js load with defer → we run on DOMContentLoaded,
// when FundlyBackend/FundlyAuth are definitely available
window.addEventListener("DOMContentLoaded", syncChallengeAccount);

// Lehká verze syncChallengeAccount() pro průběžnou kontrolu, dokud hráč
// nechá dashboard otevřený: bez toho by se cizí sázka/výsledek z jiného
// zařízení promítly až po ručním obnovení stránky nebo novém přihlášení
// (reálně nahlášeno: sázka na mobilu se na PC neobjevila ani po refreshi).
// Kontroluje jen ten jeden konkrétní účet (ne celý seznam) a na rozdíl od
// syncChallengeAccount() NEspouští jednorázové věci navázané na boot stránky
// (nákupní pixel, aktivační panel, upozornění na neaktivitu) — ty by se tu
// jinak opakovaly při každém pollu.
async function pollRemoteAccountSync() {
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) return;
  try {
    const state = Portfolio.get();
    if (!state || !state.accountId) return;
    const client = await FundlyBackend.getClient();
    if (!client) return;
    const { data: account, error } = await client
      .from("challenge_accounts")
      .select("id, synced_at")
      .eq("id", state.accountId)
      .maybeSingle();
    if (error || !account) return;
    const serverSyncedAtMs = account.synced_at ? new Date(account.synced_at).getTime() : 0;
    const localSyncedAtMs = state.syncedAt ? new Date(state.syncedAt).getTime() : 0;
    if (serverSyncedAtMs <= localSyncedAtMs + 3000) return; // server nemá nic novějšího

    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData && sessionData.session && sessionData.session.access_token;
    if (!token) return;
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/restore-account`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!data.account || data.account.id !== state.accountId) return;
    Portfolio.restore(data.account, data.tickets);
    if (typeof renderPrehled === "function") renderPrehled();
    if (typeof renderVykon === "function") renderVykon();
    if (typeof renderBankBar === "function") renderBankBar();
    const fresh = Portfolio.get();
    if (fresh && typeof renderBadges === "function") renderBadges(fresh);
    showToast("win", ft("dashjs.toast.synced"), ft("dashjs.toast.syncedBody"));
  } catch (e) { /* best-effort, zkusí se to zas při dalším pollu */ }
}
setInterval(pollRemoteAccountSync, 20000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") pollRemoteAccountSync();
});
window.addEventListener("focus", pollRemoteAccountSync);

// ---------- betting (live data from odds-api.io) ----------
// API_BASE/API_KEY/BOOKMAKER/CACHE_TTL/cacheGet/cacheSet/cacheDrop/apiGet: see js/portfolio.js
const ODDS_MIN = 1.0;
const ODDS_MAX = 8.0;
const oddsRangeText = () => ftf("dashjs.common.oddsRange", { min: ODDS_MIN.toFixed(2), max: ODDS_MAX.toFixed(2) });
const oddsOutsideTitle = () => ftf("dashjs.bet.oddsOutside", { min: ODDS_MIN.toFixed(2), max: ODDS_MAX.toFixed(2) });
// /odds/multi takes max 10 events per 1 request → batches below.
// 100 instead of 60: measured against live data — most raw events from
// /events don't actually have odds from either allowed bookmaker, so a
// bigger initial pool shows meaningfully more usable matches per sport
// (roughly +40-60% more surfaced at limit=100 vs 60 across sports tested
// 2026-09-19), at the cost of ~4 more chunked /odds/multi calls per load.
const EVENTS_PER_SPORT = 100;

// Sporty s reálným pokrytím na současném odds-api plánu (max 2 bookmakery:
// Bet365 + Sportsbet.com.au). Volejbal se záměrně vynechává — ověřeno
// napříč oběma povolenými bookmakery: 0 zápasů s použitelnými kurzy.
// Není to chyba fetchování, je to mez datového zdroje — jakmile bude plán
// s víc bookmakery, přidá se zpátky.
// Hokej byl dřív taky vynechaný ("0 zápasů"), ale to byl bug ve slugu —
// odds-api slug je "ice-hockey", ne "hockey" ("hockey" vrací "Invalid sport
// slug"). Se správným slugem má reálné pokrytí (ověřeno 30.8.: 13/13
// eventů s vrácenými kurzy mělo použitelné ML kurzy) — a homepage marketing
// copy i sports ticker (js/main.js) hokej stejně už dávno slibovaly.
// MMA byl vynechaný ze stejného důvodu ("mma" → "Invalid sport slug"),
// správný slug je "mixed-martial-arts" — ověřeno 2026-09-19, reálné
// pokrytí existuje a používá standardní "ML" trh jako ostatní sporty.
// Boxing nahrazen baseballem (2026-09-20): box používá jinak tvarovaný
// trh "To Win Fight" místo "ML" (viz historie tohoto souboru), takže se
// mu všechny zápasy tiše odfiltrovaly — oprava vyžaduje i změny ve
// vyhodnocování výsledků (settleSelection), což je risk bez dalšího
// ověření proti reálným dokončeným zápasům. Baseball má naopak čisté
// pokrytí se standardním "ML"/"Spread"/"Totals" tvarem (ověřeno 9/9 ve
// vzorku), stejnou logiku jako basketbal, a ikonu i marketing slib
// (sports ticker v js/main.js) už měl přichystané.
const SPORTS = [
  ["basketball", "Basketball", "basketbal"],
  ["football", "Football", "fotbal"],
  ["ice-hockey", "Hockey", "hokej"],
  // Esports (odds-api slug "esports": Counter-Strike, Dota 2, LoL, Valorant, Mobile Legends…) — přidáno 2026-11-04.
  // Skóre zápasu = vyhrané mapy (scores.home/away), takže ML/Spread/Totals se vyhodnocují stejně jako ostatní sporty;
  // remíza (BO2 1:1) u dvouvýsledkového ML vrací vklad (viz settleSelection).
  ["esports", "Esports", "esporty"],
  ["table-tennis", "Table tennis", "stolni-tenis"],
  ["tennis", "Tennis", "tenis"],
  ["darts", "Darts", "sipky"],
  ["baseball", "Baseball", "baseball"],
  ["mixed-martial-arts", "MMA", "mma"],
  // Wrestling (RAF a další) — odds-api ho nemá, zápasy a kurzy zadává admin (sekce Zápasy,
  // tabulka custom_events). Přidáno 2026-11-15.
  ["wrestling", "Wrestling", "wrestling"],
];
// sporty jen s vlastními zápasy (custom_events) — žádné volání odds-api
const CUSTOM_ONLY_SPORTS = new Set(["wrestling"]);
function sportName(slug, fallback) {
  const key = `dashjs.sport.${slug}`;
  const v = ft(key);
  return v && v !== key ? v : fallback;
}

let activeSport = "basketball";
let slip = []; // {id, match, pick, odds}
let sportEvents = []; // loaded matches of the active sport
const filters = { q: "", date: "", league: "", odds: "", live: false, high: false };

const sportTabs = document.getElementById("sportTabs");
const matchList = document.getElementById("matchList");
const slipBody = document.getElementById("slipBody");

// events + ML odds, 5 min cache (LIVE 1 min); odds fetch in batches of 10
// upcoming window: explicit `to` = now + 20 days (RFC3339 UTC)
// Top European football leagues get buried by volume in the generic
// /events pull — that endpoint returns hundreds of tiny regional leagues
// ahead of them in whatever order the API uses internally, so even
// EVENTS_PER_SPORT=60 (or 300, tested) surfaced zero Premier League
// matches; needed limit=1000 to see any. Fetched by exact league slug
// (param is `league`, singular — confirmed against the real API; the
// plural `leagues` is silently ignored) and merged into the general
// pool, so these leagues show up regardless of the API's default order.
// Verified slugs against /v3/leagues (2026-09-19, UEFA Nations League groups
// re-verified 2026-09-27); if a league gets renamed upstream this silently
// just stops adding it back, no error.
//
// UEFA Nations League specifically: national-team competitions have no
// single umbrella slug — each League/Group combination (A/B/C/D × its
// groups) is its own league in the API, and only the groups with fixtures
// in the near term actually exist as a queryable slug at any given moment.
// Real reported symptom: pending Nations League matches never showed up in
// the match list at all (buried in the generic pool, same root cause as
// the top club leagues above), but the SAME matches appeared the instant
// they went live — /events/live returns a small enough global set that
// burying isn't an issue there, so only the pre-match view was broken.
const PRIORITY_LEAGUES = {
  football: [
    "england-premier-league",
    "spain-laliga",
    "italy-serie-a",
    "germany-bundesliga",
    "france-ligue-1",
    "international-clubs-uefa-champions-league",
    "international-uefa-nations-league-league-a-gr-3",
    "international-uefa-nations-league-league-b-gr-4",
    "international-uefa-nations-league-league-c-gr-2",
    "international-uefa-nations-league-league-c-gr-3",
    "international-uefa-nations-league-league-c-gr-4",
    "international-uefa-nations-league-league-d-gr-2",
  ],
  // Same burying problem, checked across every sport this app offers
  // (2026-09-27) after the Nations League report: basketball and hockey
  // both had a top-tier league at 0 matches in the generic pool despite
  // real near-term fixtures (EuroLeague: 0/pool vs 10 real; NHL: 0/pool
  // vs 20 real). NBA itself has no games yet (season hasn't started —
  // not a bug). Tennis/baseball/darts/MMA/table-tennis already had
  // reasonable representation in the generic pool, left alone; tennis in
  // particular has no single stable league slug to pin here (its ATP/WTA
  // events are one slug PER TOURNAMENT, changing every week).
  basketball: ["international-euroleague"],
  "ice-hockey": ["usa-nhl"],
};

// Sport jen z vlastních zápasů: event i kurzy jsou v jednom objektu (bookmaker "Fundly").
// Živé sázení na ně není (nemají živý zdroj kurzů) — sázky končí začátkem zápasu.
async function fetchCustomSport(sport, live) {
  if (live) return { events: [], odds: [] };
  const now = Date.now();
  const mine = (await fetchCustomEvents({ sport }))
    .filter((e) => String(e.status) === "pending" && new Date(e.date).getTime() > now);
  return { events: mine, odds: mine };
}

// Záloha, když sdílená cache (odds-feed) není dostupná: původní přímé stahování z odds-api.
async function fetchSportDirect(sport, live) {
  const events = live
    ? await apiGet("/events/live", { sport })
    : await apiGet("/events", {
        sport,
        status: "pending",
        limit: String(EVENTS_PER_SPORT),
        to: new Date(Date.now() + 20 * 864e5).toISOString(),
      });

  const priorityLeagues = PRIORITY_LEAGUES[sport] || [];
  if (priorityLeagues.length) {
    const seenIds = new Set(events.map((e) => e.id));
    const priorityResults = await Promise.all(priorityLeagues.map((league) =>
      live
        ? apiGet("/events/live", { sport, league }).catch(() => [])
        : apiGet("/events", {
            sport,
            league,
            status: "pending",
            limit: "20",
            to: new Date(Date.now() + 20 * 864e5).toISOString(),
          }).catch(() => [])
    ));
    for (const list of priorityResults) {
      for (const e of list) {
        if (!seenIds.has(e.id)) { seenIds.add(e.id); events.push(e); }
      }
    }
  }
  if (!events.length) return { events, odds: [] };

  const ids = events.map((e) => e.id);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(await apiGet("/odds/multi", { eventIds: ids.slice(i, i + 10).join(","), bookmakers: BOOKMAKERS.join(",") }));
  }
  return { events, odds: chunks.flat() };
}

async function loadSportEvents(sport, live) {
  const key = live ? sport + ":live" : sport;
  const cached = cacheGet(key, live ? 60 * 1000 : CACHE_TTL);
  if (cached) return cached;

  // 1 požadavek na sdílenou cache (odds-feed) místo ~13 přímo na odds-api — viz js/portfolio.js
  const raw = CUSTOM_ONLY_SPORTS.has(sport)
    ? await fetchCustomSport(sport, live)
    : (await fetchOddsBundle(sport, live)) || (await fetchSportDirect(sport, live));
  const events = raw.events;
  const withOdds = raw.odds;
  if (!events.length) { cacheSet(key, []); return []; }

  // základní eventy nesou live stav (clock/scores) — odds odpověď je nemá
  const baseById = Object.fromEntries(events.map((e) => [e.id, e]));

  // fallback napříč oběma povolenými bookmakery — první, co má pro daný
  // zápas použitelné ML kurzy, vyhrává (Bet365 má přednost, viz BOOKMAKERS)
  function pickBookmaker(e) {
    for (const bm of [...BOOKMAKERS, CUSTOM_BOOKMAKER]) {
      const markets = (e.bookmakers && e.bookmakers[bm]) || [];
      const ml = markets.find((m) => m.name === "ML");
      const row = ml && ml.odds && ml.odds[0];
      if (row && row.home && row.away) return { bookmaker: bm, markets, row };
    }
    return null;
  }

  const merged = withOdds
    .map((e) => {
      const base = baseById[e.id] || {};
      const picked = pickBookmaker(e);
      if (!picked) return null;
      const { bookmaker, markets, row } = picked;
      return {
        id: e.id,
        home: e.home,
        away: e.away,
        league: e.league ? e.league.name : "",
        date: e.date,
        live: !!live || base.status === "live" || !!(base.clock && base.clock.running),
        clock: base.clock || null,   // { minute, period, running, statusDetail }
        scores: base.scores || null, // { home, away } (případně periods.ft apod.)
        bookmaker,
        odds: [parseFloat(row.home), row.draw ? parseFloat(row.draw) : null, parseFloat(row.away)],
        markets: markets
          .filter((m) => Array.isArray(m.odds) && m.odds.length && GRADEABLE_MARKETS.has(m.name))
          .slice(0, 14), // only markets we can actually settle — see GRADEABLE_MARKETS
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  cacheSet(key, merged);
  return merged;
}

// live badge text: skóre + minuta/perióda (např. „2:1 · 67' · 2nd half")
function liveScore(m) {
  return m.scores && typeof m.scores.home === "number" && typeof m.scores.away === "number"
    ? ` ${m.scores.home}:${m.scores.away}`
    : "";
}
function liveClock(m) {
  if (!m.clock) return "";
  const min = m.clock.minute != null ? `${m.clock.minute}'` : "";
  const per = m.clock.period || m.clock.statusDetail || "";
  return [min, per].filter(Boolean).join(" · ");
}

// market and pick translations
// hodnoty = i18n klíče (dashjs.market.*), klíče = názvy trhů z odds-api (beze změny)
const MARKET_LABELS = {
  "ML": "dashjs.market.ml",
  "Draw No Bet": "dashjs.market.dnb",
  "Double Chance": "dashjs.market.dc",
  "Double Chance HT": "dashjs.market.dcHt",
  "Spread": "dashjs.market.spread",
  "European Handicap": "dashjs.market.euroHcp",
  "Totals": "dashjs.market.totals",
  "Goals Over/Under": "dashjs.market.goalsOu",
  "Both Teams To Score": "dashjs.market.btts",
  "Spread HT": "dashjs.market.spreadHt",
  "Totals HT": "dashjs.market.totalsHt",
  "ML HT": "dashjs.market.winnerHt",
  "Half Time Result": "dashjs.market.winnerHt",
  "Odd/Even": "dashjs.market.oddEven",
  "Odd/Even HT": "dashjs.market.oddEvenHt",
  "Odd/Even 2H": "dashjs.market.oddEven2h",
  "Alternative Goal Line": "dashjs.market.altGoalLine",
  "Alternative Total Goals": "dashjs.market.altTotalGoals",
  "Alternative 1st Half Goal Line": "dashjs.market.alt1hGoalLine",
  "Alternative Asian Handicap": "dashjs.market.altAsian",
  "Alternative 1st Half Asian Handicap": "dashjs.market.alt1hAsian",
};
// Trhy, co skutečně umíme vyhodnotit (viz settleSelection v js/portfolio.js —
// obě sady MUSÍ zůstat v souladu). Zápas může nabízet desítky dalších trhů
// (rohy, kdo skóruje jako první/poslední, správný výsledek, ...), ale bez
// dat o průběhu zápasu (jen konečné skóre / poločas) je neumíme spolehlivě
// vyhodnotit — takže se na ně vůbec nedá vsadit, místo aby tiket "tiše"
// skončil jako push a hráč nechápal proč.
const GRADEABLE_MARKETS = new Set([
  "ML", "ML HT", "Half Time Result",
  "Totals", "Goals Over/Under", "Totals HT",
  "Alternative Goal Line", "Alternative Total Goals", "Alternative 1st Half Goal Line",
  "Both Teams To Score",
  "Spread", "Spread HT", "Alternative Asian Handicap", "Alternative 1st Half Asian Handicap",
  "European Handicap", "Draw No Bet",
  "Double Chance", "Double Chance HT",
  "Odd/Even", "Odd/Even HT", "Odd/Even 2H",
]);
const PICK_LABELS = {
  home: "1", draw: "X", away: "2", over: "dashjs.pick.over", under: "dashjs.pick.under", yes: "dashjs.pick.yes", no: "dashjs.pick.no",
  odd: "dashjs.pick.odd", even: "dashjs.pick.even", "1X": "1X", "12": "12", "X2": "X2",
};
function pickLabel(field) {
  const v = PICK_LABELS[field];
  return v ? (v.startsWith("dashjs.") ? ft(v) : v) : field;
}
const PICK_FIELDS = ["home", "draw", "away", "over", "under", "yes", "no", "odd", "even", "1X", "12", "X2"];

function marketLabel(name) { return MARKET_LABELS[name] ? ft(MARKET_LABELS[name]) : name; }

function oddPlayable(v) {
  const n = parseFloat(v);
  return !Number.isNaN(n) && n >= ODDS_MIN && n <= ODDS_MAX;
}

// fills the league select + quick chips from the loaded matches (top leagues
// first, by match count)
function refreshLeagueOptions() {
  const sel = document.getElementById("fLeague");
  const current = filters.league;
  const counts = {};
  sportEvents.forEach((m) => { if (m.league) counts[m.league] = (counts[m.league] || 0) + 1; });
  const leagues = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  sel.innerHTML = `<option value="">${ft("dashjs.bet.allLeagues")}</option>` +
    leagues.map((l) => `<option value="${l.replace(/"/g, "&quot;")}">${l}</option>`).join("");
  sel.value = leagues.includes(current) ? current : "";
  filters.league = sel.value;

  const chips = document.getElementById("leagueChips");
  if (chips) {
    chips.innerHTML = leagues.slice(0, 8).map((l) =>
      `<button class="filter-chip" data-league="${l.replace(/"/g, "&quot;")}" aria-pressed="${l === filters.league}">${l} · ${counts[l]}</button>`
    ).join("");
    chips.hidden = leagues.length === 0;
  }
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const tomorrow = new Date(now.getTime() + 864e5).toDateString() === d.toDateString();
  const loc = uiLocale();
  const hm = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", ...(loc === "en-US" ? {} : { hour12: false }) });
  if (today) return ftf("dashjs.common.today", { time: hm });
  if (tomorrow) return ftf("dashjs.common.tomorrow", { time: hm });
  return `${d.toLocaleDateString(loc, { day: "numeric", month: "numeric" })} ${hm}`;
}

function renderSportTabs() {
  sportTabs.innerHTML = SPORTS.map(([slug, label, icon]) => `
    <button class="${slug === activeSport ? "active" : ""}" data-sport="${slug}" role="tab" aria-selected="${slug === activeSport}">
      ${icon
        ? `<img src="assets/sports/${icon}.png" alt="" />`
        : `<span class="ic-letter">${sportName(slug, label)[0]}</span>`}
      ${sportName(slug, label)}
    </button>`).join("");
}

function renderSkeleton() {
  matchList.innerHTML = Array.from({ length: 6 }, () => `
    <div class="skel-row">
      <span style="flex:1"><span class="skel" style="display:block;height:10px;width:36%"></span>
      <span class="skel" style="display:block;height:14px;width:60%;margin-top:8px"></span></span>
      <span class="skel" style="width:60px;height:42px"></span>
      <span class="skel" style="width:60px;height:42px"></span>
      <span class="skel" style="width:60px;height:42px"></span>
    </div>`).join("");
}

function visibleEvents() {
  let list = sportEvents;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    list = list.filter((m) => `${m.home} ${m.away} ${m.league}`.toLowerCase().includes(q));
  }
  if (filters.date === "7d" || filters.date === "20d") {
    // časové pásmo: příštích 7 / 20 dní
    const until = Date.now() + (filters.date === "7d" ? 7 : 20) * 864e5;
    list = list.filter((m) => new Date(m.date).getTime() <= until);
  } else if (filters.date) {
    const target = filters.date === "dnes"
      ? new Date().toDateString()
      : new Date(Date.now() + 864e5).toDateString();
    list = list.filter((m) => new Date(m.date).toDateString() === target);
  }
  if (filters.league) {
    list = list.filter((m) => m.league === filters.league);
  }
  if (filters.odds) {
    const [lo, hi] = filters.odds.split("-").map(Number);
    list = list.filter((m) => m.odds.some((o) => o !== null && o >= lo && o <= hi));
  }
  if (filters.high) {
    list = list.filter((m) => m.odds.some((o) => o !== null && o >= 2.5 && o <= ODDS_MAX));
  }
  // odds-watch: chip "Sledované" (#qWatched) nastavuje filters.watched — viz js/odds-watch.js
  if (filters.watched && window.FundlyOddsWatch) {
    list = list.filter((m) => FundlyOddsWatch.isWatched(m.id));
  }
  return list;
}

let detailMatch = null; // open match (master -> detail)
let openGroups = null; // expanded markets in the detail (kept across re-renders)

// row of odds buttons for one market (home/draw/away, over/under, yes/no…)
// Čerstvá kontrola tiketu TESNĚ před potvrzením (stejná logika jako serverová kontrola
// v supabase/functions/_shared/ticket-admission.ts). Seznam zápasů se cachuje (5 min,
// live 1 min), takže hráč mohl sázet na kurz, který už neplatí, nebo na zápas, který mezitím
// skončil. Tohle je přesně díra, kterou šlo zneužít ("courtsiding", terms §6.1) — kurzy se
// teď před potvrzením vždy načtou znovu a zápas se ověří. Chyba API = nepřekážet (server
// stejně kontroluje znovu).
const FINISHED_STATUSES = ["settled", "finished", "ended", "completed"];
async function refreshSlipFromApi(items) {
  const byId = new Map();
  const ids = [...new Set(items.map((s) => String(s.eventId)))];
  try {
    for (let i = 0; i < ids.length; i += 10) {
      // fresh=1: kurz přímo od odds-api (ne z ~12 s staré cache) — tiket se nesmí podat za starý kurz
      const od = await apiGet("/odds/multi", { eventIds: ids.slice(i, i + 10).join(","), bookmakers: BOOKMAKERS.join(","), fresh: "1" });
      for (const ev of (Array.isArray(od) ? od : [])) byId.set(String(ev.id), ev);
    }
    const missing = ids.filter((id) => !byId.has(id));
    const statusOf = new Map();
    await Promise.all(missing.slice(0, 15).map(async (id) => {
      try { const ev = await apiGet(`/events/${encodeURIComponent(id)}`, { fresh: "1" }); statusOf.set(id, ev); } catch (e) { /* neznámé */ }
    }));
    const now = Date.now();
    const changes = [];
    for (const item of items) {
      const id = String(item.eventId);
      const ev = byId.get(id);
      if (!ev) {
        const st = statusOf.get(id);
        if (st && FINISHED_STATUSES.includes(String(st.status).toLowerCase())) {
          return { ok: false, error: ftf("dashjs.bet.finished", { match: item.match }), removeId: item.id };
        }
        if (st && (st.status === "live" || (st.date && new Date(st.date).getTime() <= now))) {
          return { ok: false, error: ftf("dashjs.bet.noOdds", { match: item.match }), removeId: item.id };
        }
        continue;
      }
      const status = String(ev.status).toLowerCase();
      if (FINISHED_STATUSES.includes(status)) return { ok: false, error: ftf("dashjs.bet.finished", { match: item.match }), removeId: item.id };
      const isLive = status === "live";
      if (!isLive && ev.date && new Date(ev.date).getTime() <= now) {
        return { ok: false, error: ftf("dashjs.bet.notLive", { match: item.match }), removeId: item.id };
      }
      item.live = isLive;
      if (ev.date) item.startTime = ev.date;

      // aktuální kurz stejného výběru (první povolený bookmaker, který trh nabízí)
      let fresh = null, marketSeen = false;
      for (const bm of [...BOOKMAKERS, CUSTOM_BOOKMAKER]) {
        const market = ((ev.bookmakers && ev.bookmakers[bm]) || []).find((m) => m.name === item.marketName);
        if (!market || !Array.isArray(market.odds)) continue;
        marketSeen = true;
        let row = null;
        if (item.hdp != null) row = market.odds.find((r) => Number(r.hdp) === Number(item.hdp)) || null;
        else if (market.odds.length === 1) row = market.odds[0];
        if (!row) continue;
        const v = parseFloat(row[item.field]);
        if (Number.isFinite(v)) { fresh = v; break; }
      }
      if (fresh === null) {
        if (isLive && (!marketSeen || item.hdp != null)) return { ok: false, error: ftf("dashjs.bet.noMarket", { match: item.match }), removeId: item.id };
        continue;
      }
      if (fresh < ODDS_MIN || fresh > ODDS_MAX) return { ok: false, error: ftf("dashjs.bet.outOfRange", { match: item.match }), removeId: item.id };
      if (Math.abs(fresh - item.oddValue) > 0.004) {
        changes.push({ match: item.match, from: item.oddValue, to: fresh });
        item.oddValue = fresh;
        item.odds = fresh;
      }
    }
    if (changes.length) {
      return { ok: false, changed: true, error: ftf("dashjs.bet.oddsChanged", { list: changes.map((c) => `${c.match} ${c.from.toFixed(2)} → ${c.to.toFixed(2)}`).join("; ") }) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: true, unverified: true }; // API nedostupné — rozhodne server
  }
}

function marketRowButtons(m, marketName, row, ri) {
  const caption = row.label || (row.hdp !== undefined ? ftf("dashjs.bet.line", { hdp: row.hdp }) : "");
  const btns = PICK_FIELDS
    .filter((f) => row[f] !== undefined && row[f] !== null)
    .map((f) => {
      const val = parseFloat(row[f]);
      if (Number.isNaN(val)) return "";
      const id = `${m.id}|${marketName}|${ri}|${f}`;
      const sel = slip.some((s) => s.id === id);
      const out = !oddPlayable(val);
      const small = row.label ? ft("dashjs.common.odds") : pickLabel(f);
      return `<button class="odd-btn ${sel ? "selected" : ""}" data-pick="${id}"
        ${out ? `disabled title="${oddsOutsideTitle()}"` : ""}>
        <small>${small}</small><b>${val.toFixed(2)}</b>
      </button>`;
    }).join("");
  if (!btns) return "";
  return `<div class="mk-row">
    ${caption ? `<span class="mk-cap">${caption}</span>` : ""}
    <span class="mk-btns">${btns}</span>
  </div>`;
}

// toggles list chrome when a detail is open
function setBetChrome(hidden) {
  ["betFiltersPanel", "sportTabs", "matchCountRow"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = hidden;
  });
}

// ---------- živé kurzy bez probliknutí (patch na místě místo překreslení) ----------
// Kurzy se v živém režimu mění každé ~2 s. Překreslení celého seznamu (innerHTML) by
// vyměnilo tlačítko hráči pod prstem → klik se ztratí, detail poskočí. Proto se mění jen
// číslo v existujícím tlačítku; celé překreslení jen při změně struktury (stažený trh,
// nová linie) a i to počká, než hráč dokončí klik/dotyk.
let liveHold = false;
let liveHoldUntil = 0;
let liveRenderPending = false;
function liveInteractionActive() { return liveHold || Date.now() < liveHoldUntil; }
matchList.addEventListener("pointerdown", () => { liveHold = true; });
["pointerup", "pointercancel", "pointerleave"].forEach((ev) => matchList.addEventListener(ev, () => {
  if (!liveHold) return;
  liveHold = false;
  liveHoldUntil = Date.now() + 600;
  setTimeout(flushLiveRender, 650);
}));
function flushLiveRender() {
  if (!liveRenderPending || liveInteractionActive()) return;
  liveRenderPending = false;
  renderMatchesKeepScroll();
}
function renderMatchesKeepScroll() {
  const y = window.scrollY;
  renderMatches();
  if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
}
// překreslit hned, nebo odložit, když hráč právě kliká
function requestLiveRender() {
  if (liveInteractionActive()) { liveRenderPending = true; return; }
  renderMatchesKeepScroll();
}

function detailSig(m) {
  return m.markets.map((mk) => mk.name + ":" + mk.odds.slice(0, 8).map((row) =>
    (row.label || row.hdp) + "/" + PICK_FIELDS.filter((f) => row[f] !== undefined && row[f] !== null && !Number.isNaN(parseFloat(row[f]))).join(",")).join(";")).join("|");
}

function patchOddBtn(btn, val) {
  const b = btn.querySelector("b");
  const txt = val.toFixed(2);
  if (b && b.textContent !== txt) {
    const old = parseFloat(b.textContent);
    b.textContent = txt;
    btn.classList.remove("odd-up", "odd-down");
    void btn.offsetWidth; // restart animace
    btn.classList.add(val > old ? "odd-up" : "odd-down");
    clearTimeout(btn._oddT);
    btn._oddT = setTimeout(() => btn.classList.remove("odd-up", "odd-down"), 3000); // šipka jen chvíli
  }
  const out = !oddPlayable(val);
  if (btn.disabled !== out) {
    btn.disabled = out;
    if (out) btn.title = oddsOutsideTitle();
    else btn.removeAttribute("title");
  }
}

// true = vše opraveno na místě; false = změnila se struktura → je potřeba překreslit
function patchLiveView(changedIds) {
  if (detailMatch) {
    const m = sportEvents.find((x) => String(x.id) === String(detailMatch));
    if (!m || !changedIds.has(String(m.id))) return true;
    if (matchList.dataset.sig !== detailSig(m)) return false;
    for (const mk of m.markets) {
      mk.odds.slice(0, 8).forEach((row, ri) => {
        for (const f of PICK_FIELDS) {
          const val = parseFloat(row[f]);
          if (Number.isNaN(val)) continue;
          const btn = matchList.querySelector(`[data-pick="${CSS.escape(`${m.id}|${mk.name}|${ri}|${f}`)}"]`);
          if (btn) patchOddBtn(btn, val);
        }
      });
    }
    return true;
  }
  for (const id of changedIds) {
    const row = matchList.querySelector(`[data-match="${CSS.escape(id)}"]`);
    if (!row) continue; // zápas není vidět (filtr) — nic
    const m = sportEvents.find((x) => String(x.id) === id);
    if (!m) continue;
    const fields = ["home", "draw", "away"];
    for (let i = 0; i < 3; i++) {
      const val = m.odds[i];
      const has = val !== null && !Number.isNaN(val);
      const btn = row.querySelector(`[data-pick="${CSS.escape(`${m.id}|ML|0|${fields[i]}`)}"]`);
      if (has !== !!btn) { // kurz zmizel / přibyl → překreslit jen tenhle řádek (ne celý seznam)
        if (liveInteractionActive()) return false; // hráč právě kliká → počkat (requestLiveRender)
        const tmp = document.createElement("div");
        tmp.innerHTML = matchRowHtml(m).trim();
        if (tmp.firstElementChild) row.replaceWith(tmp.firstElementChild);
        break;
      }
      if (btn) patchOddBtn(btn, val);
    }
  }
  return true;
}

// tiket: kurzy vybraných tipů průběžně podle živých dat — BEZ překreslení (vklad zůstane)
function patchSlipOdds(changedIds) {
  let any = false;
  for (const s of slip) {
    const [eid, mkName, ri, field] = s.id.split("|");
    if (!changedIds.has(eid)) continue;
    const m = sportEvents.find((x) => String(x.id) === eid);
    const mk = m && m.markets.find((x) => x.name === mkName);
    const row = mk && mk.odds[Number(ri)];
    const val = row ? parseFloat(row[field]) : NaN;
    if (Number.isNaN(val) || Math.abs(val - s.odds) < 0.0005) continue;
    s.odds = val;
    if ("oddValue" in s) s.oddValue = val;
    any = true;
    const el = slipBody.querySelector(`[data-remove="${CSS.escape(s.id)}"]`)?.closest(".slip-item")?.querySelector(".si-odds");
    if (el) { el.textContent = val.toFixed(2); el.classList.remove("odd-up", "odd-down"); void el.offsetWidth; el.classList.add("odd-flash"); }
  }
  if (!any) return;
  const total = slip.reduce((a, s) => a * s.odds, 1);
  const totalEl = slipBody.querySelector(".slip-total b");
  if (totalEl) totalEl.textContent = total.toFixed(2);
  document.getElementById("stakeInput")?.dispatchEvent(new Event("input")); // přepočet výhry, vklad zůstává
}

function renderMatchDetail(m) {
  setBetChrome(true);
  if (!openGroups) openGroups = new Set(m.markets.slice(0, 3).map((mk) => mk.name));
  const groups = m.markets.map((mk) => {
    const rows = mk.odds.slice(0, 8).map((row, ri) => marketRowButtons(m, mk.name, row, ri)).join("");
    if (!rows) return "";
    return `<details class="mk-acc" data-mk="${mk.name}" ${openGroups.has(mk.name) ? "open" : ""}>
      <summary>
        ${marketLabel(mk.name)}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </summary>
      <div class="mk-body">${rows}</div>
    </details>`;
  }).join("");

  matchList.dataset.sig = detailSig(m);
  matchList.innerHTML = `
    <div class="detail-bar">
      <button class="filter-chip" id="backToList">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        ${ft("dashjs.bet.backToMatches")}
      </button>
    </div>
    <div class="detail-head">
      <div class="m-league">${m.league}</div>
      <div class="detail-teams">${m.home} <span>vs</span> ${m.away}</div>
      <div class="m-time">${m.live ? `<span class="live">● LIVE${liveScore(m)}</span>${liveClock(m) ? ` · ${liveClock(m)}` : ""} · ` : ""}${m.live ? "" : `${fmtTime(m.date)} · `}${ftp("dashjs.bet.markets", m.markets.length)}</div>
    </div>
    <div class="mk-accs">${groups || `<p class="bet-msg">${ft("dashjs.bet.noMoreMarkets")}</p>`}</div>`;

  document.getElementById("backToList").addEventListener("click", () => {
    detailMatch = null;
    openGroups = null;
    renderMatches();
    window.scrollTo({ top: document.getElementById("view-sazeni").offsetTop - 60, behavior: "instant" });
  });

  matchList.querySelectorAll(".mk-acc").forEach((d) => {
    d.addEventListener("toggle", () => {
      if (d.open) openGroups.add(d.dataset.mk);
      else openGroups.delete(d.dataset.mk);
    });
  });

  // odds-watch: tlačítko "Sledovat" + graf vývoje kurzu pod hlavičkou detailu (js/odds-watch.js)
  if (window.FundlyOddsWatch) FundlyOddsWatch.mountDetail(m);
}

function renderMatches() {
  const m = detailMatch && sportEvents.find((x) => String(x.id) === String(detailMatch));
  if (m) { renderMatchDetail(m); return; }
  detailMatch = null;
  setBetChrome(false);

  const list = visibleEvents();
  document.getElementById("matchCount").textContent = String(list.length);
  if (!list.length) {
    matchList.innerHTML = `<p class="bet-msg">${ft("dashjs.bet.noMatches")}</p>`;
    return;
  }
  matchList.innerHTML = list.map(matchRowHtml).join("");
}

// jeden řádek zápasu v seznamu (sdílí renderMatches a živý patch jednoho řádku)
function matchRowHtml(m) {
    const extra = m.markets.length - 1;
  // odds-watch: hvězdička "Sledovat" + zvýraznění sledovaného řádku (js/odds-watch.js) — je přímo
  // v HTML řádku, takže přežije překreslení i živý patch jednoho řádku (patchLiveView)
  const ow = window.FundlyOddsWatch;
  return `
  <div class="match${ow ? ow.rowClass(m) : ""}" data-match="${m.id}">
    <div class="match-head" role="button" tabindex="0" aria-label="${ftf("dashjs.bet.openDetail", { home: m.home, away: m.away })}">
      ${ow ? ow.starHtml(m) : ""}
      <div class="m-info">
        <div class="m-league">${m.league}</div>
        <div class="m-teams">${m.home} – ${m.away}</div>
        <div class="m-time">${m.live ? `<span class="live">● LIVE${liveScore(m)}</span>${liveClock(m) ? ` · ${liveClock(m)}` : ""}` : fmtTime(m.date)}${extra > 0 ? ` · ${ftp("dashjs.bet.moreMarkets", extra)}` : ""}</div>
      </div>
      <div class="m-odds">
        ${m.odds.map((o, i) => {
          if (o === null || Number.isNaN(o)) return "";
          const field = ["home", "draw", "away"][i];
          const id = `${m.id}|ML|0|${field}`;
          const sel = slip.some((s) => s.id === id);
          const out = !oddPlayable(o);
          const lbl = m.odds[1] === null ? (i === 0 ? "1" : "2") : ["1", "X", "2"][i];
          return `<button class="odd-btn ${sel ? "selected" : ""}" data-pick="${id}"
            ${out ? `disabled title="${oddsOutsideTitle()}"` : ""}>
            <small>${lbl}</small><b>${o.toFixed(2)}</b>
          </button>`;
        }).join("")}
        <span class="m-chev" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </span>
      </div>
    </div>
  </div>`;
}

// resolves a clicked pick by id `eventId|market|rowIdx|field`
function resolvePick(id) {
  const [eid, marketName, ri, field] = id.split("|");
  const m = sportEvents.find((x) => String(x.id) === eid);
  if (!m) return null;
  const mk = m.markets.find((x) => x.name === marketName);
  const row = mk && mk.odds[Number(ri)];
  if (!row) return null;
  const odds = parseFloat(row[field]);
  if (Number.isNaN(odds)) return null;
  let pick;
  if (marketName === "ML") {
    pick = pickLabel(field);
  } else if (row.label) {
    pick = `${marketLabel(marketName)}: ${row.label}`;
  } else {
    const hdp = row.hdp !== undefined ? ` ${row.hdp}` : "";
    pick = `${marketLabel(marketName)}${hdp}: ${pickLabel(field)}`;
  }
  return {
    id, match: `${m.home} – ${m.away}`, pick, odds,
    eventId: m.id, // číslo z odds-api, text "fx-…" u vlastních zápasů
    sport: activeSport,
    league: m.league,
    homeTeam: m.home,
    awayTeam: m.away,
    startTime: m.date,
    // Independently confirmed by odds-api's own live-status fields (see
    // loadSportEvents' `live` computation), not just "which endpoint did
    // this come from" — lets placeBet() tell genuine in-play matches apart
    // from stale/already-finished ones the feed still lists as upcoming.
    live: !!m.live,
    marketName,
    field,
    hdp: row.hdp,
    oddValue: odds,
    pickLabel: pick,
  };
}

function renderError(err) {
  const msg = err && err.status === 429
    ? ft("dashjs.bet.rateLimit")
    : ft("dashjs.bet.loadFail");
  matchList.innerHTML = `<p class="bet-msg">${msg}<br />
    <button class="btn btn-ghost" id="betRetry">${ft("dashjs.common.tryAgain")}</button></p>`;
  document.getElementById("betRetry").addEventListener("click", () => selectSport(activeSport, true));
}

async function selectSport(slug, force) {
  activeSport = slug;
  detailMatch = null;
  openGroups = null;
  setBetChrome(false);
  renderSportTabs();
  renderSkeleton();
  document.getElementById("matchCount").textContent = "…";
  if (force) { cacheDrop(slug); cacheDrop(slug + ":live"); }
  const live = filters.live;
  try {
    const data = await loadSportEvents(slug, live);
    if (slug !== activeSport || live !== filters.live) return; // switched elsewhere meanwhile
    sportEvents = data;
    refreshLeagueOptions();
    renderMatches();
  } catch (err) {
    if (slug === activeSport) renderError(err);
  }
}

function renderBankBar() {
  const bal = document.getElementById("bankBalance");
  if (!bal) return;
  const state = Portfolio.ensure("advanced");
  bal.textContent = usd(state.balance);
  document.getElementById("bankMaxStake").textContent = usd(Portfolio.ruleMeta(state).maxStake);
  document.getElementById("bankOddsRange").textContent = `${oddsRangeText()}`;
  updateBreachPanel();
}

function updateMobileSlipBar() {
  const bar = document.getElementById("mobileSlipBar");
  if (!bar) return;
  if (!slip.length) { bar.hidden = true; return; }
  document.getElementById("msbCount").textContent = slip.length;
  document.getElementById("msbText").textContent = ftp("dashjs.slip.picksAdded", slip.length);
  bar.hidden = false;
}

document.getElementById("mobileSlipBar")?.addEventListener("click", () => {
  document.getElementById("slipPanel")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderSlip() {
  updateMobileSlipBar();
  if (!slip.length) {
    slipBody.innerHTML = `<p class="slip-empty"><img src="assets/fan-1.jpg" alt="" />${ft("dashjs.slip.empty")}</p>`;
    return;
  }
  const portfolio = Portfolio.ensure("advanced");
  const maxStake = Portfolio.ruleMeta(portfolio).maxStake;
  const totalOdds = slip.reduce((a, s) => a * s.odds, 1);
  slipBody.innerHTML = `
    ${slip.map((s) => `
      <div class="slip-item">
        <span class="si-info">
          <span class="si-match">${s.match}</span><br />
          <span class="si-pick">${ftf("dashjs.slip.pick", { pick: s.pick })}</span>
        </span>
        <span class="si-odds">${s.odds.toFixed(2)}</span>
        <button class="si-x" data-remove="${s.id}" aria-label="${ft("dashjs.slip.remove")}">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("")}
    <div class="slip-total"><span>${ft("dashjs.slip.totalOdds")}</span><b>${totalOdds.toFixed(2)}</b></div>
    <div class="field">
      <label for="stakeInput">${ftf("dashjs.slip.entrySizeMax", { max: usd(maxStake) })}</label>
      <input class="input" id="stakeInput" type="number" min="5" max="${maxStake}" value="${Math.min(80, maxStake)}" />
    </div>
    <div class="slip-total"><span>${ft("dashjs.common.potentialWin")}</span><b class="green" id="potWin"></b></div>
    ${window.FundlyJournal ? window.FundlyJournal.slipFieldsHtml() : "" /* Deník tipů: "Proč tento tip?" — text drží js/journal.js, překreslení ho nesmaže */}
    <button class="btn btn-primary" style="width:100%" id="placeBet">${ft("dashjs.slip.placeBet")}</button>
    <p class="auth-note mt" id="betNote" hidden></p>`;

  const stakeInput = document.getElementById("stakeInput");
  const potWin = document.getElementById("potWin");
  const updateWin = () => {
    let v = Math.min(Number(stakeInput.value) || 0, maxStake);
    potWin.textContent = usd(Math.round(v * slip.reduce((a, s) => a * s.odds, 1))); // aktuální kurzy (živé se mění)
  };
  // Ukázat pravidla (40% consistency limit, max. entry size, zbývající
  // balance, ...) hned při psaní částky, ne až po kliknutí na Place bet —
  // dřív se to zobrazilo až po kliknutí a hráč to často nestihl přečíst,
  // než se ticket/UI za chvíli přerenderovaly (reálně nahlášeno). Sdílí
  // stejnou validaci jako samotné odeslání (Portfolio.evaluateBet()), jen
  // bez vedlejších účinků — nezaloží tiket, jen ukáže, jestli by prošel.
  const updateBetNote = () => {
    const note = document.getElementById("betNote");
    if (!note || window.__noRealAccount) return;
    const amount = Number(stakeInput.value);
    if (!amount || amount <= 0) { note.hidden = true; return; }
    const preview = Portfolio.evaluateBet(slip, amount, []);
    if (!preview.ok) {
      note.textContent = preview.error;
      note.className = "auth-note mt error";
      note.hidden = false;
    } else if (preview.warning) {
      note.textContent = preview.warning;
      note.className = "auth-note mt warn";
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  };
  stakeInput.addEventListener("input", () => { updateWin(); updateBetNote(); });
  updateWin();
  updateBetNote();

  document.getElementById("placeBet").addEventListener("click", async () => {
    const note = document.getElementById("betNote");
    const btn = document.getElementById("placeBet");
    if (window.__noRealAccount) {
      note.textContent = ft("dashjs.slip.preview");
      note.className = "auth-note mt error";
      note.hidden = false;
      return;
    }
    // čerstvé kurzy + stav zápasu těsně před potvrzením (viz refreshSlipFromApi)
    btn.disabled = true;
    note.textContent = ft("dashjs.slip.checking");
    note.className = "auth-note mt";
    note.hidden = false;
    const fresh = await refreshSlipFromApi(slip);
    if (!fresh.ok) {
      btn.disabled = false;
      if (fresh.removeId) slip = slip.filter((s) => s.id !== fresh.removeId);
      note.textContent = fresh.error;
      note.className = "auth-note mt " + (fresh.changed ? "warn" : "error");
      renderMatches();
      renderSlip();
      return;
    }
    // value-bet flag (zakázaná strategie): pick je v odds-api value-bet
    // výpisu pro Betano. Endpoint je volitelný — chyba = žádný flag.
    let flags = [];
    try {
      const valueBets = await fetchValueBets();
      if (slip.some((s) => isValueBetSelection(valueBets, s))) flags = ["value"];
    } catch (e) { /* value-bets endpoint unavailable → skip silently */ }
    // Deník tipů (js/journal.js): volitelná poznámka + důvody se uloží s tiketem
    const journalEntry = window.FundlyJournal ? window.FundlyJournal.draft() : null;
    const result = Portfolio.placeBet(slip, Number(stakeInput.value), flags, journalEntry);
    if (!result.ok) {
      btn.disabled = false;
      note.textContent = result.error;
      note.className = "auth-note mt error";
      note.hidden = false;
      return;
    }
    note.textContent = result.warning
      ? ftf("dashjs.slip.acceptedWarn", { warning: result.warning })
      : ft("dashjs.slip.accepted");
    note.className = result.warning ? "auth-note mt warn" : "auth-note mt";
    note.hidden = false;
    btn.disabled = true;
    if (window.FundlyJournal) window.FundlyJournal.clearDraft(); // Deník tipů: poznámka patří k právě podanému tipu
    // Ne scheduleAccountSync() (2-7s debounce): sázka je přesně ten
    // okamžik, kdy je nejvyšší šance, že hráč hned zavře kartu/odhlásí se
    // (přesně to hlásili — vsaď, hned se odhlas, tiket zmizel). Okamžitý
    // push tu mezeru zkracuje z několika sekund na jednotky stovek ms.
    if (typeof pushAccountSnapshot === "function") pushAccountSnapshot();
    renderBadges(Portfolio.get()); // série disciplíny / deník — odznak může přibýt už podáním tipu
    setTimeout(() => {
      slip = [];
      renderMatches();
      renderSlip();
      renderBankBar();
    }, 900);
  });
}

// telefon: rozšířené filtry (datum, liga, kurz, ligové chipy) schované pod "Filtry" — počet aktivních v závorce
(function setupFilterToggle() {
  const panel = document.getElementById("betFiltersPanel");
  const btn = document.getElementById("bfMoreBtn");
  const count = document.getElementById("bfMoreCount");
  if (!panel || !btn) return;
  const update = () => {
    const n = ["fDate", "fLeague", "fOdds"].filter((id) => document.getElementById(id)?.value).length;
    if (count) { count.hidden = !n; count.textContent = n ? String(n) : ""; }
  };
  btn.addEventListener("click", () => {
    const open = !panel.classList.contains("bf-open");
    panel.classList.toggle("bf-open", open);
    btn.setAttribute("aria-expanded", String(open));
  });
  ["fDate", "fLeague", "fOdds"].forEach((id) => document.getElementById(id)?.addEventListener("change", update));
  update();
})();

if (sportTabs) {
  renderSportTabs();
  renderSlip();
  renderBankBar();
  selectSport(activeSport);

  sportTabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sport]");
    if (!btn || btn.dataset.sport === activeSport) return;
    selectSport(btn.dataset.sport);
  });

  matchList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-pick]");
    if (btn) {
      if (btn.disabled) return;
      const id = btn.dataset.pick;
      const existing = slip.findIndex((s) => s.id === id);
      if (existing >= 0) {
        slip.splice(existing, 1);
      } else {
        const item = resolvePick(id);
        if (!item) return;
        // one pick per match and market+row: replaces a conflicting pick if present
        const [eid, mk, ri] = id.split("|");
        slip = slip.filter((s) => !s.id.startsWith(`${eid}|${mk}|${ri}|`));
        slip.push(item);
      }
      renderMatches();
      renderSlip();
      return;
    }
    const head = e.target.closest(".match-head");
    if (head) {
      detailMatch = head.closest("[data-match]").dataset.match;
      openGroups = null;
      renderMatches();
      window.scrollTo({ top: document.getElementById("view-sazeni").offsetTop - 60, behavior: "instant" });
    }
  });

  matchList.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const head = e.target.closest(".match-head");
    if (!head) return;
    e.preventDefault();
    detailMatch = head.closest("[data-match]").dataset.match;
    renderMatches();
  });

  slipBody.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-remove]");
    if (!rm) return;
    slip = slip.filter((s) => s.id !== rm.dataset.remove);
    renderMatches();
    renderSlip();
  });

  // filters
  const betSearch = document.getElementById("betSearch");
  betSearch.addEventListener("input", () => {
    filters.q = betSearch.value.trim();
    renderMatches();
  });

  const fDate = document.getElementById("fDate");
  const qToday = document.getElementById("qToday");
  fDate.addEventListener("change", () => {
    filters.date = fDate.value;
    qToday.setAttribute("aria-pressed", String(filters.date === "dnes"));
    renderMatches();
  });
  qToday.addEventListener("click", () => {
    filters.date = filters.date === "dnes" ? "" : "dnes";
    fDate.value = filters.date;
    qToday.setAttribute("aria-pressed", String(filters.date === "dnes"));
    renderMatches();
  });

  const fLeague = document.getElementById("fLeague");
  fLeague.addEventListener("change", () => {
    filters.league = fLeague.value;
    renderMatches();
    refreshLeagueChips();
  });

  // ligové chipy — toggle filtru ligy (sdílený s selectem)
  function refreshLeagueChips() {
    document.querySelectorAll("#leagueChips [data-league]").forEach((c) =>
      c.setAttribute("aria-pressed", String(c.dataset.league === filters.league)));
  }
  const leagueChips = document.getElementById("leagueChips");
  if (leagueChips) {
    leagueChips.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-league]");
      if (!chip) return;
      filters.league = filters.league === chip.dataset.league ? "" : chip.dataset.league;
      fLeague.value = filters.league;
      renderMatches();
      refreshLeagueChips();
    });
  }

  const fOdds = document.getElementById("fOdds");
  const qHigh = document.getElementById("qHigh");
  fOdds.addEventListener("change", () => {
    filters.odds = fOdds.value;
    filters.high = false;
    qHigh.setAttribute("aria-pressed", "false");
    renderMatches();
  });
  qHigh.addEventListener("click", () => {
    filters.high = !filters.high;
    if (filters.high) { filters.odds = ""; fOdds.value = ""; }
    qHigh.setAttribute("aria-pressed", String(filters.high));
    renderMatches();
  });

  const qLive = document.getElementById("qLive");
  qLive.addEventListener("click", () => {
    filters.live = !filters.live;
    qLive.setAttribute("aria-pressed", String(filters.live));
    selectSport(activeSport);
  });

  document.getElementById("betRefresh").addEventListener("click", () => selectSport(activeSport, true));
}

// ---------- live matches: auto-refresh so scores/clocks aren't stuck until a manual click ----------
// odds-api.io itself doesn't push per-second updates (it's a polled aggregator,
// not a raw live-data feed), so true to-the-second is not realistic — this
// polls every 30s while the LIVE filter is on (structure/scores; odds come every ~2s from pollLiveOdds) and the Betting tab is visible,
// which is as close to "live" as the underlying data source allows without
// burning through the odds-api rate budget for no visible benefit.
async function autoRefreshLiveMatches() {
  if (!filters.live) return;
  const view = document.getElementById("view-sazeni");
  if (!view || view.hidden) return;
  try {
    cacheDrop(activeSport + ":live");
    const data = await loadSportEvents(activeSport, true);
    if (!filters.live || document.getElementById("view-sazeni")?.hidden) return;
    sportEvents = data;
    requestLiveRender(); // počká, když hráč právě kliká; zachová pozici stránky
  } catch (e) { /* silent — next tick retries */ }
}
// 30 s: nové/skončené zápasy, skóre a čas. Samotné KURZY se v živém režimu aktualizují
// každé ~2 s z WebSocket relé (pollLiveOdds níže).
setInterval(autoRefreshLiveMatches, 30 * 1000);

// ---------- živé kurzy v reálném čase (WebSocket relé odds-stream → tabulka live_odds) ----------
// odds-api posílá změnu kurzu ~1 s po bookmakerovi; relé ji zapíše do DB a tady se každé
// ~2 s stáhnou jen změněné řádky (pro seznam jen trh ML = pár bajtů, pro otevřený detail
// všechny trhy). Kontrola těsně před podáním tiketu jde dál přímo na odds-api (fresh=1).
let liveOddsSince = null;      // server čas posledního aplikovaného řádku (seznam)
let liveOddsDetailSince = null; // totéž pro otevřený detail
let liveOddsDetailId = null;
let liveOddsList = null;       // při novém načtení seznamu (sport, filtr, 30s obnova) znovu od plného stavu
let liveOddsBusy = false;

function applyLiveRow(m, row, withMarkets) {
  if (!m || row.bookie !== m.bookmaker) return false;
  let changed = false;
  const ml = row.ml && row.ml.home && row.ml.away ? row.ml : null;
  const next = ml
    ? [parseFloat(ml.home), ml.draw ? parseFloat(ml.draw) : null, parseFloat(ml.away)]
    : [null, null, null]; // trh stažený (suspendováno) → tlačítka se schovají
  if (JSON.stringify(next) !== JSON.stringify(m.odds)) { m.odds = next; changed = true; }
  if (withMarkets && Array.isArray(row.markets)) {
    m.markets = row.markets.filter((mk) => Array.isArray(mk.odds) && mk.odds.length && GRADEABLE_MARKETS.has(mk.name)).slice(0, 14);
    changed = true;
  } else {
    // trh ML v m.markets musí sedět s m.odds — z něj se bere kurz při kliknutí (resolvePick)
    const i = m.markets.findIndex((mk) => mk.name === "ML");
    if (ml && i >= 0) m.markets[i] = { ...m.markets[i], odds: [ml] };
    else if (ml && i < 0) m.markets.unshift({ name: "ML", odds: [ml] });
    else if (!ml && i >= 0) m.markets.splice(i, 1);
  }
  return changed;
}

async function pollLiveOdds() {
  if (!filters.live || liveOddsBusy || document.hidden) return;
  const view = document.getElementById("view-sazeni");
  if (!view || view.hidden) return;
  const live = sportEvents.filter((m) => m.live && /^\d+$/.test(String(m.id)));
  if (!live.length) return;
  // nový seznam (REST snímek může být starší než WS) → znovu plný aktuální stav řádků
  if (sportEvents !== liveOddsList) { liveOddsList = sportEvents; liveOddsSince = null; liveOddsDetailSince = null; }
  const openId = detailMatch ? String(detailMatch) : null;
  if (openId !== liveOddsDetailId) { liveOddsDetailId = openId; liveOddsDetailSince = null; }
  liveOddsBusy = true;
  try {
    const byId = new Map(live.map((m) => [String(m.id), m]));
    const changedIds = new Set();
    const rows = await fetchLiveOdds([...byId.keys()], liveOddsSince, false);
    if (rows) for (const r of rows) {
      if (applyLiveRow(byId.get(String(r.event_id)), r, false)) changedIds.add(String(r.event_id));
      if (!liveOddsSince || r.updated_at > liveOddsSince) liveOddsSince = r.updated_at;
    }
    if (openId && byId.has(openId)) {
      const det = await fetchLiveOdds([openId], liveOddsDetailSince, true);
      if (det) for (const r of det) {
        if (applyLiveRow(byId.get(openId), r, true)) changedIds.add(openId);
        if (!liveOddsDetailSince || r.updated_at > liveOddsDetailSince) liveOddsDetailSince = r.updated_at;
      }
    }
    if (changedIds.size && filters.live && sportEvents === liveOddsList) {
      patchSlipOdds(changedIds);
      if (!patchLiveView(changedIds)) requestLiveRender();
    }
  } finally {
    liveOddsBusy = false;
  }
}
setInterval(pollLiveOdds, 2000);

// ---------- leaderboard: real ranking from leaderboard-get ----------
let lbMetric = "profit";
let lbRows = [];

async function loadLeaderboard() {
  const el = document.getElementById("lbList");
  if (!el) return;
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
    el.innerHTML = `<p class="bet-msg">${ft("dashjs.lb.needsBackend")}</p>`;
    return;
  }
  try {
    const client = await FundlyBackend.getClient();
    const session = client ? (await client.auth.getSession()).data.session : null;
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/leaderboard-get`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    lbRows = Array.isArray(data.rows) ? data.rows : [];
    renderLb();
  } catch (e) {
    el.innerHTML = `<p class="bet-msg">${ft("dashjs.lb.loadFail")}</p>`;
  }
}

function renderLb() {
  const el = document.getElementById("lbList");
  if (!el) return;
  if (!lbRows.length) {
    el.innerHTML = `<p class="bet-msg">${ft("dashjs.lb.empty")}</p>`;
    return;
  }
  const rows = [...lbRows].sort((a, b) =>
    lbMetric === "profit" ? b.profit - a.profit : lbMetric === "roi" ? b.roi - a.roi : b.winRate - a.winRate);
  const val = (r) =>
    lbMetric === "profit" ? (r.profit >= 0 ? "+" : "") + usd(r.profit) : lbMetric === "roi" ? r.roi + " % ROI" : r.winRate + " %";
  el.innerHTML = rows.map((r, i) => `
    <div class="lb-row ${r.isMe ? "me" : ""}">
      <span class="lb-rank">${i + 1}</span>
      <span class="pay2-av">${r.name.split(" ").map((w) => w[0]).join("").replace(".", "").slice(0, 2).toUpperCase()}</span>
      <span class="lb-name">${r.name}${r.isMe ? ft("dashjs.lb.you") : ""}<small>${packageByKey(r.packageKey || "").name}</small></span>
      <span class="lb-val">${val(r)}</span>
    </div>`).join("");
}

document.getElementById("lbMetric")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  document.querySelectorAll("#lbMetric button").forEach((b) => b.classList.toggle("active", b === btn));
  lbMetric = btn.dataset.metric;
  renderLb();
});
// Ne rovnou tady: loadLeaderboard() na první řádce čte fundlyBackendEnabled()
// z js/config.js, který se (na rozdíl od tohoto skriptu) načítá s "defer" —
// v tomhle bodě ještě neexistuje, takže by to natrvalo ukázalo "needs the
// backend — sign in first." i přihlášenému hráči. showView() teď leaderboard
// dotáhne až při skutečném přepnutí na tu záložku (stejně jako Payouts/Affiliate).

// ---------- payouts ----------
// Status labels of the withdrawal history (values are written by the request-payout / whop-payout edge functions).
const WD_STATUS = {
  // label = i18n klíč (dashjs.wd.*)
  pending: { tag: "pend", label: "dashjs.wd.pending" },
  approved: { tag: "pend", label: "dashjs.wd.approved" },
  paid: { tag: "win", label: "dashjs.wd.paid" },
  sent: { tag: "win", label: "dashjs.wd.paid" },
  failed: { tag: "loss", label: "dashjs.wd.failed" },
  rejected: { tag: "loss", label: "dashjs.wd.rejected" },
};

// Withdrawal history from the database — only with the backend and a signed-in
// user (row ownership is guarded by RLS). Otherwise the demo content in HTML stays.
async function loadPayoutHistory() {
  const box = document.getElementById("wdHistory");
  if (!box || typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) return;
  try {
    const user = await FundlyAuth.getUser();
    if (!user) return;
    const client = await FundlyBackend.getClient();
    const { data: payouts, error } = await client
      .from("payouts")
      .select("id, amount, status, method, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return;

    // "First payout" badge: alespoň jedna vyplacená žádost — marker se ukládá
    // do lokálního stavu, protože badge se počítá čistě z Portfolio state.
    const paidPayouts = (payouts || []).filter((p) => p.status === "paid" || p.status === "sent");
    if (paidPayouts.length) {
      const state = Portfolio.get();
      if (state) {
        let changed = false;
        if (!state.hasPayout) { state.hasPayout = true; changed = true; }
        // Kvalifikační tikety na payout se resetují PO každém vyřízeném
        // payoutu — lastPayoutAt se dřív nikde nenastavoval, takže se
        // efektivně nikdy nereselo. Bereme nejnovější vyřízený payout.
        const latestPaidAt = paidPayouts.reduce((max, p) => (!max || p.created_at > max ? p.created_at : max), null);
        if (latestPaidAt && latestPaidAt !== state.lastPayoutAt) { state.lastPayoutAt = latestPaidAt; changed = true; }
        if (changed) {
          Portfolio.save(state);
          renderBadges(state);
          if (typeof renderPrehled === "function") renderPrehled();
        }
      }
    }

    if (!payouts || !payouts.length) {
      box.innerHTML = `<p class="slip-empty">${ft("dashjs.wd.empty")}</p>`;
      return;
    }
    box.innerHTML = payouts.map((p) => {
      const st = WD_STATUS[p.status];
      const s = st ? { tag: st.tag, label: ft(st.label) } : { tag: "pend", label: String(p.status) };
      const date = new Date(p.created_at).toLocaleDateString(uiLocale());
      const method = p.method === "Bank transfer" ? ft("forms.wdBank") : p.method === "Crypto" ? ft("forms.wdCrypto") : (p.method || "—");
      return `<div class="k-row neutral">${date} · ${method}<span class="n"><span class="tag ${s.tag}">${s.label}</span> ${usd(Number(p.amount) || 0)}</span></div>`;
    }).join("");
  } catch (e) {
    // silent fallback to demo content
  }
}

const wdForm = document.getElementById("wdForm");
if (wdForm) {
  wdForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = document.getElementById("wdNote");
    // With the backend and a signed-in user we send a real request via the
    // request-payout edge function; otherwise the demo behavior stays unchanged.
    if (typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled()) {
      let user = null;
      try {
        user = await FundlyAuth.getUser();
      } catch (e) {
        // backend unavailable → fallback to the demo behavior below
      }
      if (user) {
        const amount = Number(document.getElementById("wdAmount").value);
        const method = document.getElementById("wdMethod").value;
        if (!Number.isFinite(amount) || amount < 10) {
          note.textContent = ft("forms.wdMin");
          note.className = "auth-note mt error";
          note.hidden = false;
          return;
        }
        if (amount > 4000) {
          note.textContent = ft("forms.wdMax");
          note.className = "auth-note mt error";
          note.hidden = false;
          return;
        }
        if (!method) {
          note.textContent = ft("forms.wdPick");
          note.className = "auth-note mt error";
          note.hidden = false;
          return;
        }
        try {
          const client = await FundlyBackend.getClient();
          const { data: sessionData } = await client.auth.getSession();
          const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/request-payout`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${sessionData?.session?.access_token || ""}`,
            },
            body: JSON.stringify({ amount, method }),
          });
          const data = await res.json().catch(() => ({}));
          const ok = res.ok && data.ok;
          note.textContent = ok
            ? ft("forms.wdSubmitted")
            : srvMsg(data.error) || ft("forms.wdFailed"); // the server explains why (KYC, cooldown, cap…) — better than a generic line
          note.className = ok ? "auth-note mt" : "auth-note mt error";
          note.hidden = false;
          if (ok) {
            wdForm.reset();
            loadPayoutHistory();
          }
        } catch (err) {
          note.textContent = ft("forms.wdFailed");
          note.className = "auth-note mt error";
          note.hidden = false;
        }
        return;
      }
    }
    note.textContent = ft("forms.wdLocked");
    note.className = "auth-note mt error";
    note.hidden = false;
  });
}

// ---------- affiliate program (self-service, edge function affiliate-stats) ----------
// Only with the backend and a signed-in user — the function matches affiliate
// codes by the caller's e-mail. Otherwise the view shows an info empty state.

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const AFF_PLAN_LABELS = {
  all: "dashjs.aff.allPackages", // i18n klíč
  starter: "Starter",
  standard: "Standard",
  advanced: "Advanced",
  pro: "Pro",
  elite: "Elite",
};

function affPlanLabel(k) {
  const v = AFF_PLAN_LABELS[k];
  return v ? (v.startsWith("dashjs.") ? ft(v) : v) : k;
}

function renderAffiliateMessage(msg) {
  const stats = document.getElementById("affStatGrid");
  const codes = document.getElementById("affCodes");
  const referrals = document.getElementById("affReferrals");
  if (stats) stats.innerHTML = "";
  if (codes) codes.innerHTML = `<p class="bet-msg">${esc(msg)}</p>`;
  if (referrals) referrals.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">—</td></tr>`;
}

function renderAffiliate(data) {
  const stats = document.getElementById("affStatGrid");
  const codes = document.getElementById("affCodes");
  const referrals = document.getElementById("affReferrals");
  if (!stats || !codes || !referrals) return;

  const dstat = (label, value, green) => `
    <div class="dstat">
      <div class="lbl">${label}</div>
      <div class="val ${green ? "green" : ""}">${value}</div>
    </div>`;

  const active = data.codes.filter((c) => c.active);
  stats.innerHTML =
    dstat(ft("dashjs.aff.activeCodes"), active.length, false) +
    dstat(ft("dashjs.aff.conversions"), data.totals.conversions, false) +
    dstat(ft("dashjs.aff.earnings"), usd(data.totals.earnings), true);

  codes.innerHTML = data.codes.length
    ? data.codes.map((c) => {
        const limit = c.usageLimit == null ? "∞" : c.usageLimit;
        const state = c.active
          ? `<span class="tag win">${ft("dashjs.aff.active")}</span>`
          : `<span class="tag loss">${ft("dashjs.aff.archived")}</span>`;
        return `<div class="k-row neutral"><span><b>${esc(c.code)}</b> · ${esc(affPlanLabel(c.planKey))} · ${ftf("dashjs.aff.forBuyers", { pct: c.discountPct })}<br><span style="color:var(--text-muted);font-size:.8125rem">${ftf("dashjs.aff.commission", { pct: c.commissionPct, used: c.used, limit })}</span></span><span class="n">${state} ${usd(c.earnings)}</span></div>`;
      }).join("")
    : `<p class="bet-msg">${ft("dashjs.aff.noCode")}</p>`;

  referrals.innerHTML = data.referrals.length
    ? data.referrals.map((r) => {
        const date = new Date(r.date).toLocaleDateString(uiLocale());
        const tickets = r.ticketsCapped ? "5+" : String(r.tickets);
        const amt = r.currency === "eur"
          ? `${(Number(r.amount) || 0).toLocaleString("en-US")} €`
          : usd(Number(r.amount) || 0);
        return `<tr>
          <td>${esc(r.email)}</td>
          <td>${esc(affPlanLabel(r.packageKey) || "?")}</td>
          <td class="odds">${esc(r.code)}</td>
          <td class="odds">${tickets}</td>
          <td class="odds">${amt}</td>
          <td style="color:var(--text-muted)">${date}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">${ft("dashjs.aff.noReferrals")}</td></tr>`;
}

async function loadAffiliateStats() {
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
    return renderAffiliateMessage(ft("dashjs.aff.demo"));
  }
  try {
    const client = await FundlyBackend.getClient();
    if (!client) return renderAffiliateMessage(ft("dashjs.aff.needsBackend"));
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return renderAffiliateMessage(ft("dashjs.aff.signIn"));
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/affiliate-stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return renderAffiliateMessage(srvMsg(data.error) || ft("dashjs.aff.loadFail"));
    renderAffiliate(data);
  } catch (e) {
    renderAffiliateMessage(ft("dashjs.aff.loadFail"));
  }
}

// ---------- profile ----------
// badges are rendered via renderBadges() above (called from refreshAfterSettlement)

// ---------- profile: contact support ----------
const supportForm = document.getElementById("supportForm");
if (supportForm) {
  supportForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("supportSubmit");
    const note = document.getElementById("supportNote");
    btn.disabled = true;
    note.hidden = true;
    try {
      if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
        throw new Error(ft("forms.contactUnavailable"));
      }
      const client = await FundlyBackend.getClient();
      const user = client ? (await client.auth.getUser()).data.user : null;
      const session = client ? (await client.auth.getSession()).data.session : null;
      if (!user) throw new Error(ft("forms.signInFirst"));
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/support-submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          email: user.email,
          message: document.getElementById("supportMessage").value.trim(),
          source: "dashboard",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(ft("forms.contactFailed"));
      supportForm.reset();
      note.textContent = ft("forms.contactSent");
      note.className = "auth-note mt";
      note.hidden = false;
    } catch (err) {
      note.textContent = err.message || ft("forms.contactFailed");
      note.className = "auth-note mt error";
      note.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- account settings: password, 2FA (TOTP), preferred payout method ----------
// Vykresluje se do dvou míst (Profile tab i limited "no account" dashboard),
// odsud proto prefix "s"/"na" na id, ať se prvky v DOM nesrazí.
function renderSettingsPanel(prefix) {
  return `
    <div class="panel mt">
      <h3>${ft("forms.setTitle")}</h3>
      <div class="two-col" style="margin-top:4px">
        <form id="${prefix}PassForm">
          <div class="field">
            <label for="${prefix}NewPass">${ft("forms.newPassword")}</label>
            <div class="pw-field">
              <input class="input" id="${prefix}NewPass" type="password" autocomplete="new-password" minlength="8" placeholder="••••••••" required />
              <button type="button" class="pw-toggle" data-pw-toggle aria-label="${ft("forms.showPassword")}" aria-pressed="false">
                <svg class="eye" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/></svg>
                <svg class="eye-off" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M2 2l12 12" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
              </button>
            </div>
          </div>
          <button class="btn btn-ghost" type="submit" id="${prefix}PassSubmit">${ft("forms.changePassword")}</button>
          <p class="auth-note mt" id="${prefix}PassNote" hidden></p>
        </form>
        <div>
          <div class="field" style="margin-bottom:8px">
            <label for="${prefix}PayoutMethod">${ft("forms.payoutLabel")}</label>
            <div class="ref-box" style="margin-top:0">
              <input class="input" id="${prefix}PayoutMethod" placeholder="${ft("forms.payoutPh")}" />
              <button class="btn btn-primary" style="height:auto" id="${prefix}PayoutSave">${ft("forms.save")}</button>
            </div>
          </div>
          <p class="t-meta">${ft("forms.payoutMeta")}</p>
        </div>
      </div>
    </div>
    <div class="panel mt">
      <h3>${ft("forms.mfaHeading")}</h3>
      <div id="${prefix}MfaState"><p class="t-small">${ft("forms.mfaChecking")}</p></div>
    </div>`;
}

async function setupAccountSettings(prefix) {
  const client = await FundlyBackend.getClient();
  if (!client) return;

  // změna hesla
  const passForm = document.getElementById(`${prefix}PassForm`);
  if (passForm) {
    passForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = document.getElementById(`${prefix}PassSubmit`);
      const note = document.getElementById(`${prefix}PassNote`);
      btn.disabled = true;
      try {
        const { error } = await client.auth.updateUser({ password: document.getElementById(`${prefix}NewPass`).value });
        if (error) throw error;
        passForm.reset();
        note.textContent = ft("forms.passChanged");
        note.className = "auth-note mt";
        note.hidden = false;
      } catch (err) {
        note.textContent = FundlyAuth.errorText(err) || ft("forms.passFailed");
        note.className = "auth-note mt error";
        note.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // preferovaná výplatní metoda
  const payoutSave = document.getElementById(`${prefix}PayoutSave`);
  if (payoutSave) {
    payoutSave.addEventListener("click", async () => {
      payoutSave.disabled = true;
      try {
        await saveProfileSetting({ payoutMethod: document.getElementById(`${prefix}PayoutMethod`).value });
        payoutSave.textContent = ft("forms.saved");
      } catch (e) {
        payoutSave.textContent = ft("forms.failed");
      }
      setTimeout(() => { payoutSave.textContent = ft("forms.save"); payoutSave.disabled = false; }, 1500);
    });
  }
  try {
    const { data: account } = await client
      .from("challenge_accounts")
      .select("payout_method")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const input = document.getElementById(`${prefix}PayoutMethod`);
    if (input && account?.payout_method) input.value = account.payout_method;
  } catch (e) { /* best-effort prefill */ }

  // 2FA (TOTP) přes Supabase Auth MFA — funguje jen pokud je MFA zapnuté v projektu
  const mfaState = document.getElementById(`${prefix}MfaState`);
  if (!mfaState) return;
  async function renderMfaState() {
    try {
      const { data, error } = await client.auth.mfa.listFactors();
      if (error) throw error;
      const verified = (data.totp || []).find((f) => f.status === "verified");
      if (verified) {
        mfaState.innerHTML = `
          <div class="k-row win">${ft("forms.mfaEnabled")}<span class="n"><button class="btn btn-ghost" id="${prefix}MfaDisable">${ft("forms.mfaDisable")}</button></span></div>
          <p class="auth-note mt" id="${prefix}MfaDisableNote" hidden></p>`;
        document.getElementById(`${prefix}MfaDisable`).addEventListener("click", async (e) => {
          const disableBtn = e.currentTarget;
          const disableNote = document.getElementById(`${prefix}MfaDisableNote`);
          disableBtn.disabled = true;
          // dřív se výsledek tiše zahazoval — bez AAL2 session (běžné po
          // čerstvém přihlášení, viz FundlyAuth.mfaStepUpNeeded) unenroll()
          // vrátí chybu a tlačítko vypadalo, že "nedělá nic".
          const { error } = await client.auth.mfa.unenroll({ factorId: verified.id });
          if (error) {
            disableNote.textContent = error.message.includes("AAL2")
              ? ft("forms.mfaDisableAal")
              : ft("forms.mfaDisableFail");
            disableNote.className = "auth-note mt error";
            disableNote.hidden = false;
            disableBtn.disabled = false;
            return;
          }
          renderMfaState();
        });
      } else {
        mfaState.innerHTML = `<button class="btn btn-primary" id="${prefix}MfaEnroll">${ft("forms.mfaEnable")}</button>`;
        document.getElementById(`${prefix}MfaEnroll`).addEventListener("click", async () => {
          const enrollBtn = document.getElementById(`${prefix}MfaEnroll`);
          enrollBtn.disabled = true;
          try {
            const { data: enrolled, error: enrollError } = await client.auth.mfa.enroll({ factorType: "totp" });
            if (enrollError) throw enrollError;
            mfaState.innerHTML = `
              <p class="t-small">${ft("forms.mfaScan")}</p>
              <img src="${enrolled.totp.qr_code}" alt="${ft("forms.mfaQrAlt")}" style="width:160px;height:160px;margin:12px 0;border-radius:8px;background:#fff;padding:8px" />
              <form id="${prefix}MfaVerifyForm" style="max-width:220px">
                <div class="field"><input class="input" id="${prefix}MfaCode" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required /></div>
                <button class="btn btn-primary" type="submit">${ft("forms.mfaVerifyEnable")}</button>
                <p class="auth-note mt" id="${prefix}MfaNote" hidden></p>
              </form>`;
            document.getElementById(`${prefix}MfaVerifyForm`).addEventListener("submit", async (e) => {
              e.preventDefault();
              const note = document.getElementById(`${prefix}MfaNote`);
              try {
                const challenge = await client.auth.mfa.challenge({ factorId: enrolled.id });
                if (challenge.error) throw challenge.error;
                const verify = await client.auth.mfa.verify({
                  factorId: enrolled.id,
                  challengeId: challenge.data.id,
                  code: document.getElementById(`${prefix}MfaCode`).value.trim(),
                });
                if (verify.error) throw verify.error;
                renderMfaState();
              } catch (err) {
                note.textContent = ft("forms.mfaInvalid");
                note.className = "auth-note mt error";
                note.hidden = false;
              }
            });
          } catch (err) {
            mfaState.innerHTML = `<p class="t-small">${ft("forms.mfaNa1")}</p>`;
          } finally {
            enrollBtn.disabled = false;
          }
        });
      }
    } catch (e) {
      mfaState.innerHTML = `<p class="t-small">${ft("forms.mfaNa2")}</p>`;
    }
  }
  renderMfaState();
}

// HTML se vykreslí hned (čistá šablona, žádná závislost na backendu) —
// #sNewPass/#naNewPass tak existují v DOM okamžitě, což potřebuje mj.
// jumpToPasswordSettings() volaná ze syncChallengeAccount() na DOMContentLoaded.
// setupAccountSettings() ale volá FundlyBackend.getClient() hned na první
// řádce, a ten žije v js/whop.js, který se (na rozdíl od tohoto skriptu)
// načítá s "defer" — spustí se tedy AŽ PO tomhle synchronním <script>.
// Zavolat to rovnou tady shodilo funkci s ReferenceError dřív, než se
// stihl navěsit submit listener na formulář změny hesla — tlačítko
// "Change password" tak reálně nikdy nic neudělalo.
["s", "na"].forEach((prefix) => {
  const slot = document.getElementById(prefix === "s" ? "settingsSlot" : "naSettingsSlot");
  if (!slot) return;
  slot.innerHTML = renderSettingsPanel(prefix);
});
window.addEventListener("DOMContentLoaded", () => {
  ["s", "na"].forEach((prefix) => {
    if (document.getElementById(prefix === "s" ? "settingsSlot" : "naSettingsSlot")) {
      setupAccountSettings(prefix);
    }
  });
});

// ---------- profile: subtabs (Overview / Badges / Leaderboard / Settings / Support) ----------
document.getElementById("profileTabs")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-ptab]");
  if (!btn) return;
  document.querySelectorAll("#profileTabs button").forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  document.querySelectorAll(".profile-sub").forEach((sec) => {
    sec.hidden = sec.dataset.psec !== btn.dataset.ptab;
  });
});

// nastavení leaderboardu (přezdívka + sdílení) — uloží se přes profile-update
async function saveProfileSetting(patch) {
  const client = await FundlyBackend.getClient();
  const session = client ? (await client.auth.getSession()).data.session : null;
  if (!session) throw new Error(ft("forms.signInFirst"));
  const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/profile-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(srvMsg(data.error) || ft("dashjs.common.couldNotSave"));
}

const lbShare = document.getElementById("lbShare");
if (lbShare) {
  lbShare.addEventListener("click", async () => {
    const next = lbShare.getAttribute("aria-checked") !== "true";
    lbShare.setAttribute("aria-checked", String(next));
    try {
      await saveProfileSetting({ leaderboardOptIn: next });
    } catch (e) {
      lbShare.setAttribute("aria-checked", String(!next)); // revert on failure
    }
  });
}

const nickSave = document.getElementById("nickSave");
if (nickSave) {
  nickSave.addEventListener("click", async () => {
    nickSave.disabled = true;
    try {
      await saveProfileSetting({ nickname: document.getElementById("nickInput").value });
      nickSave.textContent = ft("forms.saved");
    } catch (e) {
      nickSave.textContent = ft("forms.failed");
      if (typeof showToast === "function") showToast("loss", ft("dashjs.toast.nickFail"), e.message || ft("dashjs.toast.nickFailBody"));
    }
    setTimeout(() => { nickSave.textContent = ft("forms.save"); nickSave.disabled = false; }, 1500);
  });
}

// ---------- overview: render from the real portfolio state ----------
// Equity chart: balance curve + dashed levels (phase target, fixed drawdown
// floor) with labels and a purple area under the curve. Data = state.equityHistory,
// only the presentation changes.
// Body grafu: lokální equityHistory; když chybí (obnova účtu ze serveru, jiné zařízení —
// historie zůstatku se na serveru nedrží), složí se z tipů aktuální fáze: start fáze →
// každý vyhodnocený tip (vklad + výsledek) → aktuální zůstatek (vč. čekajících vkladů).
function equityPoints(state) {
  const hist = Array.isArray(state.equityHistory) ? state.equityHistory : [];
  if (hist.length >= 2) return hist;
  const start = new Date(state.phaseStartedAt).getTime();
  const settled = (state.tickets || [])
    .filter((t) => t.settledAt && t.status !== "pending" && new Date(t.placedAt).getTime() >= start)
    .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt));
  if (!settled.length) return hist;
  let bal = Number(state.phaseBaseline) || 0;
  const pts = [{ t: state.phaseStartedAt, balance: bal }];
  settled.forEach((t) => {
    bal += (Number(t.payout) || 0) - (Number(t.stake) || 0);
    pts.push({ t: t.settledAt, balance: bal });
  });
  if (Math.abs(bal - state.balance) > 0.5) pts.push({ t: new Date().toISOString(), balance: state.balance });
  return pts;
}

function renderEquityChart(state) {
  const points = equityPoints(state);
  if (points.length < 2) {
    return `<p class="bet-msg">${ft("dashjs.chart.empty")}</p>`;
  }
  const w = 600, h = 190, padL = 6, padR = 6, padT = 14, padB = 8;
  const targetAbs = state.phase === "funded" ? null : state.phaseBaseline + Portfolio.phaseTarget(state);
  const dd = Portfolio.drawdownInfo(state); // static ve fázích, trailing na funded
  const floor = dd.floor;
  const values = points.map((p) => p.balance);
  const lo = Math.min(...values, floor);
  const hi = Math.max(...values, targetAbs || 0);
  const span = hi - lo || 1;
  const X = (i) => padL + (i * (w - padL - padR)) / (points.length - 1);
  const Y = (v) => padT + (h - padT - padB) * (1 - (v - lo) / span);
  const coords = points.map((p, i) => `${X(i).toFixed(1)},${Y(p.balance).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  const stroke = up ? "var(--accent)" : "#ff6b6b";
  const lastX = X(points.length - 1), lastY = Y(values[values.length - 1]);

  // levels: phase target (green) and fixed drawdown floor (red)
  const levels = [
    targetAbs !== null ? { v: targetAbs, cls: "eq-lv-target", label: ftf("dashjs.chart.target", { amount: usd(targetAbs) }) } : null,
    { v: floor, cls: "eq-lv-floor", label: ftf("dashjs.chart.floor", { amount: usd(floor) }) },
  ].filter(Boolean);
  // labels must not overlap — sort by y and enforce a minimum gap
  levels.sort((a, b) => Y(a.v) - Y(b.v));
  let prevY = -Infinity;
  levels.forEach((lv) => {
    lv.y = Math.max(Y(lv.v), prevY + 11);
    prevY = lv.y;
  });

  const area = `${padL},${(h - padB).toFixed(1)} ` + coords.join(" ") + ` ${lastX.toFixed(1)},${(h - padB).toFixed(1)}`;
  const fmtDay = (t) => new Date(t).toLocaleDateString(uiLocale(), { day: "numeric", month: "numeric" });

  return `
    <svg viewBox="0 0 ${w} ${h}" class="equity-svg" role="img" aria-label="${ft("dashjs.chart.aria")}">
      <defs>
        <linearGradient id="eqArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="rgb(153 69 255 / .38)" />
          <stop offset="1" stop-color="rgb(153 69 255 / 0)" />
        </linearGradient>
      </defs>
      ${levels.map((lv) => `
        <line class="eq-lv ${lv.cls}" x1="${padL}" y1="${Y(lv.v).toFixed(1)}" x2="${w - padR}" y2="${Y(lv.v).toFixed(1)}" />
        <text class="eq-lv-label ${lv.cls}" x="${w - padR}" y="${(lv.y - 3).toFixed(1)}">${lv.label}</text>`).join("")}
      <polygon points="${area}" fill="url(#eqArea)" />
      <polyline points="${coords.join(" ")}" fill="none" stroke="${stroke}" style="color:${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${stroke}" />
    </svg>
    <div class="eq-legend">
      ${targetAbs !== null ? `<span><i class="sw eq-lv-target"></i>${ft("dashjs.chart.phaseTarget")}</span>` : ""}
      <span><i class="sw eq-lv-floor"></i>${dd.trailing ? ft("dashjs.chart.floorTrailing") : ft("dashjs.chart.floorFixed")}</span>
      <span class="eq-dates">${fmtDay(points[0].t)} – ${fmtDay(points[points.length - 1].t)}</span>
    </div>`;
}

// warning tagy zakázaných strategií na tiketu (flags: ["arbitrage","value"])
function flagTags(t) {
  if (!t.flags || !t.flags.length) return "";
  return t.flags.map((f) =>
    `<span class="tag flag">${f === "arbitrage" ? ft("dashjs.tk.flagArb") : ft("dashjs.tk.flagValue")}</span>`
  ).join(" ");
}

// status → [tag class, label] (cashedout = early cashout, vlastní tag)
function ticketTag(t) {
  if (t.status === "won") return ["win", ft("dashjs.tk.won")];
  if (t.status === "lost") return ["loss", ft("dashjs.tk.lost")];
  if (t.status === "push") return ["push", ft("dashjs.tk.push")];
  if (t.status === "cashedout") return ["push", ft("dashjs.tk.cashedout")];
  return ["pend", ft("dashjs.tk.pending")];
}

// rozbalovací detail čekajícího tiketu: výběry, kurzy, vklad, možná výhra,
// early cashout (90 % vkladu — bez dat o pohybu kurzů, poctivě popsané)
function ticketDetailHtml(t) {
  const potWin = Math.round(t.stake * t.combinedOdds);
  const cashout = Math.round(t.stake * 0.9);
  return `
    <div class="tk-sels">
      ${t.selections.map((s) => `
        <div class="tk-sel"><span>${s.homeTeam && s.awayTeam ? `${s.homeTeam} – ${s.awayTeam}` : (s.league || ft("dashjs.common.match"))} · ${s.pickLabel || s.field}<br><small style="color:var(--text-muted)">${fmtTime(s.startTime)}</small></span><span class="n">${s.oddValue.toFixed(2)}</span></div>`).join("")}
    </div>
    <div class="tk-meta">
      <span>${ft("dashjs.common.entrySize")} <b>${usd(t.stake)}</b></span>
      <span>${ft("dashjs.common.odds")} <b>${t.combinedOdds.toFixed(2)}</b></span>
      <span>${ft("dashjs.common.potentialWin")} <b class="green">${usd(potWin)}</b></span>
    </div>
    <button class="btn btn-ghost" data-cashout="${t.id}">${ftf("dashjs.tk.cashoutBtn", { amount: usd(cashout) })}</button>`;
}

function renderRecentTickets(state) {
  const recent = state.tickets.slice(0, 5);
  if (!recent.length) {
    return `<p class="bet-msg">${ft("dashjs.tk.noneRecent")}</p>`;
  }
  return recent.map((t) => {
    const rSel0 = t.selections[0];
    const label = t.selections.length > 1
      ? ftf("dashjs.common.accumulator", { n: t.selections.length })
      : (rSel0.homeTeam && rSel0.awayTeam ? `${rSel0.homeTeam} – ${rSel0.awayTeam}` : (rSel0.league || ft("dashjs.common.ticket")));
    const [tag, tagText] = ticketTag(t);
    // čekající tiket je rozbalovací (detail + cashout)
    if (t.status === "pending") {
      return `<details class="k-row neutral tk">
        <summary>${label} · ${usd(t.stake)}<span class="n">${flagTags(t)}<span class="tag ${tag}">${tagText}</span></span></summary>
        <div class="tk-body">${ticketDetailHtml(t)}</div>
      </details>`;
    }
    return `<div class="k-row neutral">${label} · ${usd(t.stake)}<span class="n">${flagTags(t)}<span class="tag ${tag}">${tagText}</span></span></div>`;
  }).join("");
}

function renderPrehled() {
  const view = document.getElementById("view-prehled");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  const meta = Portfolio.ruleMeta(state);
  const phaseLabel = state.phase === "funded" ? ft("dashjs.common.partnerAccount") : ftf("dashjs.common.phaseN", { n: state.phase });
  document.getElementById("ovSubtitle").textContent = `${phaseLabel} · Fundly Challenge`;
  document.getElementById("ovPhaseChip").textContent = state.pendingPhase ? ftf("dashjs.ov.pendingReview", { phase: phaseLabel }) : phaseLabel;
  const pendingPanel = document.getElementById("pendingApprovalPanel");
  if (pendingPanel) {
    pendingPanel.hidden = !state.pendingPhase;
    if (state.pendingPhase) {
      const nextLabel = state.pendingPhase === "funded" ? ft("dashjs.ov.nextFunded") : ftf("dashjs.ov.nextPhase", { n: state.pendingPhase });
      let waitNote = ft("dashjs.ov.waitDefault");
      if (pendingApprovalSince) {
        const hours = Math.floor((Date.now() - new Date(pendingApprovalSince).getTime()) / 3600000);
        if (hours >= 1) {
          waitNote = hours >= 24
            ? ftp("dashjs.ov.waitDays", Math.floor(hours / 24))
            : ftp("dashjs.ov.waitHours", hours);
        }
      }
      document.getElementById("pendingApprovalText").textContent =
        ftf("dashjs.ov.pendingText", { next: nextLabel, wait: waitNote });
    }
  }
  renderMomentum(state);

  const target = Portfolio.phaseTarget(state);
  const profit = state.balance - state.phaseBaseline;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((profit / target) * 100))) : 100;
  const toGoal = Math.max(0, target - profit);
  const daysLeft = Portfolio.daysRemaining(state);
  const s = Portfolio.summary(state);

  // hero block: micro-label, big balance, delta row, chips, equity chart
  const deltaPct = state.phaseBaseline > 0 ? (profit / state.phaseBaseline) * 100 : 0;
  const sign = profit >= 0 ? "+" : "−";
  const deltaFmt = `${sign}$${Math.abs(Math.round(profit)).toLocaleString("en-US")} · ${sign}${Math.abs(deltaPct).toLocaleString(uiLocale(), { maximumFractionDigits: 2 })} %`;
  document.getElementById("balanceCard").innerHTML = `
    <div class="balance-top">
      <div>
        <div class="bc-plan">${ft("dashjs.ov.balance")}</div>
        <div class="bc-amount">${usd(state.balance)}</div>
        <div class="bc-delta ${profit >= 0 ? "pos" : "neg"}">${ftf("dashjs.ov.inPhase", { delta: deltaFmt })}</div>
      </div>
      <div class="bc-chips">
        <span class="chip-phase">${phaseLabel}</span>
        <span class="chip-ghost">${state.packageName} · ${ftf("dashjs.ov.share", { pct: meta.profitSplit })}</span>
      </div>
    </div>
    <div class="bc-chart">${renderEquityChart(state)}</div>`;

  document.getElementById("ovStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${ft("dashjs.ov.profit")}</div>
      <div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${usd(s.netProfit)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.8"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg></span>${ft("dashjs.ov.toTarget")}</div>
      <div class="val">${state.phase === "funded" ? "—" : usd(toGoal)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M4.5 2h6v4a3 3 0 01-6 0V2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 9v2.5M5 13h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>${ft("dashjs.ov.wins")}</div>
      <div class="val">${s.won} <small>/ ${s.won + s.lost}</small></div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 5a1.5 1.5 0 001.5-1.5h8A1.5 1.5 0 0013 5v1.6a1.9 1.9 0 000 3.8V12a1.5 1.5 0 00-1.5 1.5h-8A1.5 1.5 0 002 12V5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" transform="translate(0,-1.2)"/></svg></span>${ft("dashjs.ov.tickets")}</div>
      <div class="val">${s.total}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 4.5v3.3l2.2 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${ft("dashjs.ov.winRate")}</div>
      <div class="val ${s.winRate >= 50 ? "green" : ""}">${s.winRate} %</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 12.5l4-8 3 5 4-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${ft("dashjs.ov.avgOdds")}</div>
      <div class="val">${s.avgOdds.toFixed(2)}</div>
    </div>`;

  document.getElementById("recentTickets").innerHTML = renderRecentTickets(state);

  const dd = Portfolio.drawdownInfo(state);
  const dl = Portfolio.dailyLossInfo(state);
  const worst = Portfolio.worstCaseInfo(state, 0);
  const worstFloor = Math.max(worst.dailyFloor, worst.totalFloor);
  const worstRemaining = Math.max(0, worst.worstCaseBalance - worstFloor);

  // right column: rules and limits with thin progress bars
  const phaseLen = Portfolio.phaseLengthDays(state);
  const pctTime = Math.max(0, Math.min(100, Math.round((daysLeft / phaseLen) * 100)));
  // qualifying tickets: winning ones with net profit ≥ 0.5 % of capital, in the current phase
  const qual = Portfolio.countQualifyingTickets(state, state.phaseStartedAt);
  const pctTickets = Math.max(0, Math.min(100, Math.round((qual / meta.qualifyingTickets) * 100)));
  const pctDaily = dl.limit > 0 ? Math.max(0, Math.min(100, Math.round((dl.remaining / dl.limit) * 100))) : 100;
  const ddTone = dd.pct < 30 ? "danger" : dd.pct < 60 ? "warn" : "";
  const dlTone = pctDaily < 30 ? "danger" : pctDaily < 60 ? "warn" : "";
  const rrRow = (label, value, barPct, tone, sub) => `
    <div class="rr">
      <div class="rr-head"><span class="rr-k">${label}</span><span class="rr-v ${tone === "danger" ? "red" : ""}">${value}</span></div>
      ${barPct === null ? "" : `<div class="progress rr-bar ${tone || ""}"><span style="width:${barPct}%"></span></div>`}
      ${sub ? `<div class="rr-sub">${sub}</div>` : ""}
    </div>`;
  document.getElementById("rulesRail").innerHTML = `
    <h3>${ft("dashjs.rules.glance")}</h3>
    ${state.phase === "funded"
      ? rrRow(ft("dashjs.rules.phaseTarget"), ft("dashjs.common.completed"), null, "", ft("dashjs.rules.partnerNoTarget"))
      : rrRow(ft("dashjs.rules.phaseTarget"), `${usd(Math.max(0, profit))} / ${usd(target)}`, pct, pct >= 100 ? "" : "", pct >= 100 ? ft("dashjs.common.completed") : ftf("dashjs.rules.toGo", { amount: usd(toGoal) }))}
    ${rrRow(dd.trailing ? ft("dashjs.rules.lossTrailing") : ft("dashjs.rules.lossStatic"), `${usd(Math.round(dd.remaining))} / ${usd(dd.limit)}`, Math.round(dd.pct), ddTone,
      dd.trailing ? ftf("dashjs.rules.floorFollows", { floor: usd(dd.floor) }) : ftf("dashjs.rules.floorFixed", { floor: usd(dd.floor) }))}
    ${rrRow(ft("dashjs.rules.dailyLoss"), ftf("dashjs.rules.today", { remaining: usd(Math.round(dl.remaining)), limit: usd(dl.limit) }), pctDaily, dlTone, ft("dashjs.rules.resetsUtc"))}
    ${(() => {
      const marginBefore = Math.max(1, state.balance - worstFloor);
      const pctExposure = Math.max(0, Math.min(100, Math.round((worstRemaining / marginBefore) * 100)));
      const tone = pctExposure < 30 ? "danger" : pctExposure < 60 ? "warn" : "";
      return rrRow(ft("dashjs.rules.exposure"), ftf("dashjs.rules.pendingAmount", { amount: usd(worst.exposure) }), pctExposure, tone,
        ftf("dashjs.rules.worstCase", { balance: usd(Math.round(worst.worstCaseBalance)), margin: usd(Math.round(worstRemaining)) }));
    })()}
    ${state.phase === "funded" ? "" : rrRow(ft("dashjs.rules.timeLimit"), ftf("dashjs.rules.daysOf", { left: daysLeft, len: phaseLen }), pctTime, pctTime < 25 ? "danger" : "", "")}
    ${rrRow(ft("dashjs.rules.qualifying"), `${Math.min(qual, meta.qualifyingTickets)} / ${meta.qualifyingTickets}`, pctTickets, "", ft("dashjs.rules.qualifyingSub"))}
    ${rrRow(ft("dashjs.rules.maxEntry"), usd(meta.maxStake), null, "", ft("dashjs.rules.perTicket"))}
    ${rrRow(ft("dashjs.rules.odds"), `${ODDS_MIN.toFixed(2)} – ${ODDS_MAX.toFixed(2)}`, null, "", "")}
    ${rrRow(ft("dashjs.rules.split"), `${meta.profitSplit} %`, null, "", ft("dashjs.rules.splitSub"))}
    <div class="rr-phase">
      <span class="rr-phase-label">${ft("dashjs.rules.phase")}</span>
      <span class="rr-phase-name">${phaseLabel}</span>
      <span class="rr-phase-sub">${ftf("dashjs.rules.started", { date: new Date(state.phaseStartedAt).toLocaleDateString(uiLocale()) })}${state.phase === "funded" ? "" : ftp("dashjs.rules.daysLeftSuffix", daysLeft)}</span>
    </div>`;

  document.getElementById("ovLimity").innerHTML = `
    <div class="limit-row">
      <span class="k">${ft("dashjs.rules.totalLoss")} <small>${ftf("dashjs.rules.floorInfo", { kind: dd.trailing ? ft("dashjs.rules.kindTrailing") : ft("dashjs.rules.kindStatic"), floor: usd(dd.floor) })}</small></span>
      <span class="v">${ftf("dashjs.common.amountLeft", { amount: usd(Math.round(dd.remaining)) })}</span>
    </div>
    <div class="dd-bar" role="img" aria-label="${esc(ftf("dashjs.common.amountLeft", { amount: usd(Math.round(dd.remaining)) }))}">
      <span class="dd-fill" style="width:${dd.pct}%"></span>
      <span class="cursor" style="left:${dd.pct}%"></span>
    </div>
    <div class="dd-scale">
      <span class="lo">${ftf("dashjs.rules.floorCap", { floor: usd(dd.floor) })}</span>
      ${dd.pct > 75
        // zůstatek u horního okraje: místo dvou čísel vedle sebe jedno "zůstatek / start"
        ? `<span class="hi"><b>${usd(state.balance)}</b> / ${usd(dd.trailing ? state.hwm : state.cap)}</span>`
        : `<span class="now" style="left:${Math.max(30, dd.pct)}%">${usd(state.balance)}</span>
      <span class="hi">${usd(dd.trailing ? state.hwm : state.cap)}</span>`}
    </div>
    <div class="limit-row" style="margin-top:14px">
      <span class="k">${ft("dashjs.rules.dailyLoss")} <small>${ft("dashjs.rules.resetsUtcSmall")}</small></span>
      <span class="v">${ftf("dashjs.rules.leftOf", { remaining: usd(Math.round(dl.remaining)), limit: usd(dl.limit) })}</span>
    </div>
    <div class="limit-row">
      <span class="k">${ft("dashjs.rules.exposure")} <small>${ft("dashjs.rules.exposureSub")}</small></span>
      <span class="v">${ftf("dashjs.rules.exposureVal", { exposure: usd(worst.exposure), balance: usd(Math.round(worst.worstCaseBalance)) })}</span>
    </div>
    <div class="limit-row">
      <span class="k">${ft("dashjs.rules.qualifying")} <small>${ft("dashjs.rules.qualifyingSmall")}</small></span>
      <span class="v">${Math.min(qual, meta.qualifyingTickets)} / ${meta.qualifyingTickets}</span>
    </div>
    <div class="limit-row">
      <span class="k">${ft("dashjs.rules.withdrawal")} <small>${ft("dashjs.rules.partnerSmall")}</small></span>
      <span class="v">${ft("dashjs.rules.withdrawalVal")}</span>
    </div>`;

  document.getElementById("ovPravidla").innerHTML = `
    <div class="rules-grid">
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.split")}</div><div class="v green">${meta.profitSplit} %</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.maxEntry")}</div><div class="v">${usd(meta.maxStake)}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.odds")}</div><div class="v">${oddsRangeText()}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.maxLoss")}</div><div class="v">${usd(dd.limit)}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.dailyLoss")}</div><div class="v">${usd(dl.limit)}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.timeLimit")}</div><div class="v">${ft("dashjs.rules.daysPerPhase")}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.qualifying")}</div><div class="v">${ft("dashjs.rules.qualifyingVal")}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.withdrawal")}</div><div class="v">${ft("dashjs.rules.profitPct")}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.maxPayout")}</div><div class="v">${ft("dashjs.rules.maxPayoutVal")}</div></div>
      <div class="rule-tile"><div class="k">${ft("dashjs.rules.consistency")}</div><div class="v">${ftf("dashjs.rules.perTicketMax", { amount: usd(Math.round(Portfolio.consistencyLimit(state))) })}</div></div>
    </div>
    <p class="t-meta" style="margin-top:10px">${ft("dashjs.rules.consistencyNote")}</p>`;

  const steps = [
    { title: ft("dashjs.journey.phase1"), desc: ftf("dashjs.journey.target", { amount: usd(meta.target1) }), img: "assets/journey-phase1.jpg" },
    { title: ft("dashjs.journey.phase2"), desc: ftf("dashjs.journey.target", { amount: usd(meta.target2) }), img: "assets/journey-phase2.jpg" },
    { title: ft("dashjs.journey.partner"), desc: ftf("dashjs.journey.partnerDesc", { split: meta.profitSplit }), img: "assets/journey-funded.jpg" },
  ];
  const currentIndex = state.phase === "funded" ? 2 : state.phase - 1;
  document.getElementById("ovCesta").innerHTML = `<div class="journey">${steps.map((step, i) => {
    const cls = i < currentIndex ? "done" : i === currentIndex ? "now" : "";
    const dot = i < 2 ? String(i + 1) : "✓";
    const desc = i === currentIndex && state.phase !== "funded"
      ? ftf("dashjs.journey.inProgress", { desc: step.desc, pct })
      : step.desc;
    return `<div class="j-step ${cls}">
      <div class="j-dot-col"><span class="j-dot">${dot}</span>${i < steps.length - 1 ? '<span class="j-line"></span>' : ""}</div>
      <div class="j-body">
        <img class="j-thumb" src="${step.img}" alt="" />
        <span><span class="t">${step.title}</span><br /><span class="d">${desc}</span></span>
      </div>
    </div>`;
  }).join("")}</div>`;
  renderPayoutConds(state);
  renderProfile(state);
}
renderPrehled();

// ---------- payouts: payout conditions (Partner account) ----------
// Per the rules doc: (1) profit buffer +5 % of capital — ONE-TIME at the start
// of the funded phase (once the high-water mark passes it, it stays met);
// (2) 5 qualifying tickets (winning, net profit ≥ +0.5 % of capital) BEFORE
// EVERY payout — the counter resets after each payout request;
// (3) payout = 80 % of profit since the last payout, max $4,000 flat.
function renderPayoutConds(state) {
  const el = document.getElementById("wdConds");
  if (!el) return;
  if (state.phase !== "funded") {
    el.innerHTML = `<p class="t-meta" style="margin-top:10px">${ft("forms.wdCondsLocked")}</p>`;
    return;
  }
  const meta = Portfolio.ruleMeta(state);
  const bufferNeed = Math.round(state.cap * (meta.payoutBufferPct / 100));
  // buffer je jednorázový: stačí, když ho někdy překročil high-water mark
  const bufferMet = state.hwm >= state.cap + bufferNeed;
  const profit = Math.max(0, state.balance - state.cap);
  const qual = Portfolio.countQualifyingTickets(state, state.lastPayoutAt || state.phaseStartedAt);

  // 14denní cooldown (viz request-payout na serveru — tohle je jen náhled,
  // finální rozhodnutí dělá server v okamžiku žádosti).
  const cooldownFrom = state.lastPayoutAt || state.phaseStartedAt;
  const nextEligible = new Date(new Date(cooldownFrom).getTime() + 14 * 86400000);
  const cooldownDone = nextEligible.getTime() <= Date.now();

  el.innerHTML = `
    <div class="k-rows" style="margin-top:12px">
      <div class="k-row neutral">${ft("forms.wdCondBuffer").replace("{pct}", meta.payoutBufferPct)}<span class="n ${bufferMet ? "green" : ""}">${bufferMet ? ft("forms.wdDone") : `${usd(profit)} / ${usd(bufferNeed)}`}</span></div>
      <div class="k-row neutral">${ft("forms.wdCondQual")}<span class="n ${qual >= meta.qualifyingTickets ? "green" : ""}">${Math.min(qual, meta.qualifyingTickets)} / ${meta.qualifyingTickets}</span></div>
      <div class="k-row neutral">${ft("forms.wdCondCool")}<span class="n ${cooldownDone ? "green" : ""}">${cooldownDone ? ft("forms.wdOpenNow") : ft("forms.wdOpens").replace("{date}", nextEligible.toLocaleDateString(uiLocale()))}</span></div>
      <div class="k-row neutral">${ft("forms.wdCondPayout")}<span class="n">${ft("forms.wdCondPayoutVal")}</span></div>
    </div>`;
}

// ---------- profile: account panel + limits from the real portfolio state ----------
function renderProfile(state) {
  if (!document.getElementById("pfName")) return;
  const s = Portfolio.summary(state);
  const meta = Portfolio.ruleMeta(state);
  const dd = Portfolio.drawdownInfo(state);
  const target = Portfolio.phaseTarget(state);
  const profit = state.balance - state.phaseBaseline;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((profit / target) * 100))) : 100;
  const phaseLabel = state.phase === "funded" ? ft("dashjs.common.partnerAccount") : ftf("dashjs.common.phaseN", { n: state.phase });
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  set("pfName", state.packageName);
  set("pfCap", usd(state.cap));
  set("pfPhase", phaseLabel);
  set("pfBalance", usd(state.balance));
  set("pfProfit", `${s.netProfit >= 0 ? "+" : ""}${usd(s.netProfit)}`);
  document.getElementById("pfProfit").classList.toggle("green", s.netProfit >= 0);
  document.getElementById("pfBalance").classList.add("green");
  set("pfTickets", String(s.total));
  set("pfWinRate", `${s.winRate} %`);
  document.getElementById("pfWinRate").classList.toggle("green", s.winRate >= 50);

  if (state.phase === "funded") {
    set("pfGoalLabel", ft("dashjs.common.partnerAccount"));
    set("pfGoalPct", ft("dashjs.profile.noTarget"));
    document.getElementById("pfGoalBar").style.width = "100%";
    set("pfGoalMeta", ft("dashjs.profile.unlimitedPayouts"));
  } else {
    set("pfGoalLabel", ftf("dashjs.profile.progress", { amount: usd(state.phaseBaseline + target) }));
    set("pfGoalPct", `${pct} %`);
    document.getElementById("pfGoalBar").style.width = pct + "%";
    set("pfGoalMeta", ftp("dashjs.profile.goalMeta", Portfolio.daysRemaining(state), { amount: usd(Math.max(0, target - profit)) }));
  }

  set("pfDdDetail", dd.trailing ? ftf("dashjs.profile.trailingFloor", { floor: usd(dd.floor) }) : ftf("dashjs.profile.fixedFloor", { floor: usd(dd.floor) }));
  set("pfDdRemain", ftf("dashjs.common.amountLeft", { amount: usd(Math.round(dd.remaining)) }));
  document.getElementById("pfDdBar").style.width = Math.round(dd.pct) + "%";

  const dl = Portfolio.dailyLossInfo(state);
  const daysLeft = Portfolio.daysRemaining(state);
  set("pfDaysLeft", state.phase === "funded" ? ft("dashjs.profile.unlimited") : ftp("dashjs.profile.days", daysLeft));
  const deadline = new Date(new Date(state.phaseStartedAt).getTime() + Portfolio.phaseLengthDays(state) * 86400000);
  set("pfDeadline", state.phase === "funded"
    ? ft("dashjs.profile.fundedDeadline")
    : ftf("dashjs.profile.deadline", { date: deadline.toLocaleDateString(uiLocale()) }));

  const rules = document.getElementById("pfRules");
  if (rules) rules.innerHTML = `
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.split")}</div><div class="v green">${meta.profitSplit} %</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.maxEntry")}</div><div class="v">${usd(meta.maxStake)}</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.odds")}</div><div class="v">${oddsRangeText()}</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.maxLoss")}</div><div class="v">${usd(dd.limit)}</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.dailyLoss")}</div><div class="v">${usd(dl.limit)}</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.timeLimit")}</div><div class="v">${ft("dashjs.rules.daysPerPhase")}</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.qualifying")}</div><div class="v">${ft("dashjs.rules.qualifyingVal")}</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.withdrawal")}</div><div class="v">${ft("dashjs.rules.profitPct")}</div></div>
    <div class="rule-tile"><div class="k">${ft("dashjs.rules.maxPayout")}</div><div class="v">${ft("dashjs.rules.maxPayoutVal")}</div></div>`;

  const history = document.getElementById("pfAccountHistory");
  if (history) {
    history.innerHTML = lastFetchedAccounts.length
      ? accountHistoryRowsHtml(lastFetchedAccounts)
      : `<p class="bet-msg">${ft("dashjs.profile.noHistory")}</p>`;
  }
}

// ---------- performance: render from the real portfolio state ----------
function renderVykon() {
  const view = document.getElementById("view-vykon");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  document.getElementById("vykonSubtitle").textContent = ftf("dashjs.vykon.subtitle", { name: state.packageName });
  const s = Portfolio.summary(state);

  document.getElementById("vykonStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${ft("dashjs.vykon.currentProfit")}</div>
      <div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${usd(s.netProfit)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M4.5 2h6v4a3 3 0 01-6 0V2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 9v2.5M5 13h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>${ft("dashjs.ov.winRate")}</div>
      <div class="val ${s.winRate >= 50 ? "green" : ""}">${s.winRate} %</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 12.5l4-8 3 5 4-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${ft("dashjs.vykon.avgOdds")}</div>
      <div class="val">${s.avgOdds.toFixed(2)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 4.5v3.3l2.2 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${ft("dashjs.vykon.pending")}</div>
      <div class="val">${s.pending}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5v12M10.5 4.5c0-1.2-1.3-2-3-2s-3 .8-3 2 1.3 2 3 2 3 .8 3 2-1.3 2-3 2-3-.8-3-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>${ft("dashjs.vykon.entered")}</div>
      <div class="val">${usd(s.staked)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${ft("dashjs.vykon.returned")}</div>
      <div class="val ${s.returned >= s.staked && s.staked > 0 ? "green" : ""}">${usd(s.returned)}</div>
    </div>`;

  document.getElementById("vykonBreakdown").innerHTML = `
    <div class="k-row win">${ft("dashjs.vykon.won")}<span class="n">${s.won}</span></div>
    <div class="k-row loss">${ft("dashjs.vykon.lost")}<span class="n">${s.lost}</span></div>
    <div class="k-row pend">${ft("dashjs.vykon.pending")}<span class="n">${s.pending}</span></div>`;

  document.getElementById("vykonFinancials").innerHTML = `
    <div class="k-row neutral">${ft("dashjs.vykon.entered")}<span class="n">${usd(s.staked)}</span></div>
    <div class="k-row neutral">${ft("dashjs.vykon.returned")}<span class="n">${usd(s.returned)}</span></div>
    <div class="k-row neutral">${ft("dashjs.vykon.netProfit")}<span class="n ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${usd(s.netProfit)}</span></div>`;

  const days = Portfolio.dailyNet(state, 7);
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  document.getElementById("vykonBarChart").innerHTML = days.map((d) => {
    const heightPct = d.net === 0 ? 4 : Math.max(6, Math.round((Math.abs(d.net) / maxAbs) * 100));
    const cls = d.net > 0 ? "pos" : d.net < 0 ? "neg" : "";
    return `<div class="bc-col"><span class="bar ${cls}" style="height:${heightPct}%"></span><span class="d">${d.label}</span></div>`;
  }).join("");

  const recent = state.tickets.slice(0, 8);
  document.getElementById("vykonTicketTable").innerHTML = recent.length ? recent.map((t) => {
    const vSel0 = t.selections[0];
    const label = t.selections.length > 1
      ? ftf("dashjs.common.accumulator", { n: t.selections.length })
      : (vSel0.homeTeam && vSel0.awayTeam ? `${vSel0.homeTeam} – ${vSel0.awayTeam}` : (vSel0.league || ft("dashjs.common.ticket")));
    const tip = t.selections.length > 1 ? ft("dashjs.common.accTip") : (vSel0.pickLabel || "");
    const [tag, tagText] = ticketTag(t);
    // čekající tiket: kliknutelný řádek + skrytý detail s cashoutem
    if (t.status === "pending") {
      return `<tr class="tk-exp" data-tkexp="${t.id}" title="${ft("dashjs.vykon.showDetail")}"><td>${label}</td><td>${tip}</td><td class="odds">${t.combinedOdds.toFixed(2)}</td><td>${usd(t.stake)}</td><td>${flagTags(t)}<span class="tag ${tag}">${tagText}</span></td></tr>` +
        `<tr class="tk-detail" hidden><td colspan="5">${ticketDetailHtml(t)}</td></tr>`;
    }
    return `<tr><td>${label}</td><td>${tip}</td><td class="odds">${t.combinedOdds.toFixed(2)}</td><td>${usd(t.stake)}</td><td>${flagTags(t)}<span class="tag ${tag}">${tagText}</span></td></tr>`;
  }).join("") : `<tr><td colspan="5">${ft("dashjs.vykon.noTickets")}</td></tr>`;

  const { days: dailyRows } = Portfolio.dailyBalanceHistory(state);
  const dailyTable = document.getElementById("vykonDailyTable");
  if (dailyTable) {
    dailyTable.innerHTML = dailyRows.length
      ? dailyRows.slice().reverse().map((d) => `
        <tr>
          <td>${new Date(d.date).toLocaleDateString(uiLocale(), { month: "short", day: "numeric" })}</td>
          <td>${d.count}</td>
          <td class="${d.net >= 0 ? "green" : ""}" style="${d.net < 0 ? "color:#ff9d9d" : ""}">${d.net >= 0 ? "+" : ""}${usd(d.net)}</td>
          <td class="odds">${usd(d.balance)}</td>
        </tr>`).join("")
      : `<tr><td colspan="4">${ft("dashjs.vykon.noSettled")}</td></tr>`;
  }
  window.FundlyAnalytics?.render(); // záložka Analýza (js/analytics.js) — překreslí se jen když je otevřená
}

document.getElementById("vykonRefresh")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.innerHTML = ft("dashjs.vykon.refreshing");
  try {
    // vyhodnotí čekající tikety (klient), stáhne co mezitím dořešil server
    // (settle-tickets cron), a teprve pak přerenderuje — tlačítko tak
    // slouží i jako ruční pojistka, kdyby hráč pochyboval, že se něco
    // "neuložilo": po refreshi vidí přesně to, co má server.
    await Portfolio.checkSettlements();
    if (typeof syncAccountNow === "function") await syncAccountNow();
  } catch (err) { /* refresh je best-effort */ }
  renderVykon();
  btn.disabled = false;
  btn.innerHTML = label;
});

// ---------- přepnutí jazyka: překreslit právě viditelné části generované v JS ----------
// Statické HTML přeloží js/i18n.js samo (data-i18n); tady jen to, co JS vykresluje
// do innerHTML/textContent. Vzácnější panely (výplaty, affiliate, žebříček) se
// obnoví jen když jsou zrovna otevřené, jinak při dalším otevření.
document.addEventListener("fundly:lang-changed", () => {
  const safe = (fn) => { try { fn(); } catch (e) { /* jedna část nesmí shodit ostatní */ } };
  const visible = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };
  safe(renderNotifications);
  safe(() => {
    const state = Portfolio.get();
    if (state) { renderBadges(state); renderMomentum(state); }
  });
  safe(renderPrehled);
  safe(renderVykon);
  safe(renderBankBar);
  safe(() => {
    if (!sportTabs) return;
    renderSportTabs();
    // seznam zápasů: jen když už je načtený (ne přes skeleton / chybovou hlášku)
    if (matchList && !matchList.querySelector(".skel-row, #betRetry")) {
      refreshLeagueOptions();
      renderMatches();
    }
    // tiket: zachovat rozepsaný vklad
    const stakeBefore = document.getElementById("stakeInput")?.value;
    renderSlip();
    const stakeInput = document.getElementById("stakeInput");
    if (stakeInput && stakeBefore !== undefined && stakeBefore !== "") {
      stakeInput.value = stakeBefore;
      stakeInput.dispatchEvent(new Event("input"));
    }
  });
  safe(() => { if (lbRows.length) renderLb(); });
  safe(() => {
    if (!window.__noRealAccount) return;
    const list = document.getElementById("naAccounts");
    if (list && lastFetchedAccounts.length) list.innerHTML = accountHistoryRowsHtml(lastFetchedAccounts);
    showResetOfferFromAccounts(lastFetchedAccounts);
  });
  safe(() => { if (visible("view-vyplaty")) loadPayoutHistory(); });
  safe(() => { if (visible("view-affiliate")) loadAffiliateStats(); });
  // nastavení účtu (heslo / výplata / 2FA): překreslit a znovu navázat, pokud v něm hráč
  // zrovna nic nerozpracoval (rozepsané heslo, probíhající zapnutí 2FA)
  safe(() => {
    if (typeof FundlyBackend === "undefined") return;
    ["s", "na"].forEach((prefix) => {
      const slot = document.getElementById(prefix === "s" ? "settingsSlot" : "naSettingsSlot");
      if (!slot) return;
      if (document.getElementById(`${prefix}MfaVerifyForm`) || document.getElementById(`${prefix}NewPass`)?.value) return;
      slot.innerHTML = renderSettingsPanel(prefix);
      setupAccountSettings(prefix);
    });
  });
});

// úvodní sekce z adresy (dashboard#novinky) + výchozí stav historie
(function initialRoute() {
  const v = location.hash.slice(1);
  try { history.replaceState({ view: ROUTABLE_VIEWS.has(v) ? v : "prehled" }, ""); } catch (e) { /* */ }
  if (ROUTABLE_VIEWS.has(v) && v !== "prehled") setTimeout(() => showView(v), 0);
})();
