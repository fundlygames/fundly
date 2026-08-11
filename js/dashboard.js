/* Fundly dashboard — section switching, betting, leaderboard, profile */

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");

// ---------- section switching ----------
const views = ["prehled", "vykon", "sazeni", "zebricek", "vyplaty", "affiliate", "akademie", "profil"];

function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (name === "prehled" && typeof renderPrehled === "function") renderPrehled();
  if (name === "vykon" && typeof renderVykon === "function") renderVykon();
  if (name === "sazeni" && typeof renderBankBar === "function") renderBankBar();
  if (name === "profil" && typeof renderBadges === "function") renderBadges(Portfolio.get());
  if (name === "vyplaty" && typeof loadPayoutHistory === "function") loadPayoutHistory();
  if (name === "affiliate" && typeof loadAffiliateStats === "function") loadAffiliateStats();
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-view]");
  if (nav) { showView(nav.dataset.view); return; }
  const link = e.target.closest("[data-view-link]");
  if (link) showView(link.dataset.viewLink);
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
    if (!window.confirm(`Cash out now for $${amount.toLocaleString("en-US")} (early settlement −10 %)?`)) return;
    const r = Portfolio.cashOut(co.dataset.cashout);
    if (r.ok) {
      showToast("push", "Ticket cashed out", `+${usd(r.cashout)}`);
      if (typeof renderPrehled === "function") renderPrehled();
      if (typeof renderVykon === "function") renderVykon();
      if (typeof renderBankBar === "function") renderBankBar();
      if (typeof scheduleAccountSync === "function") scheduleAccountSync();
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
          <div class="notif-time">${new Date(n.t).toLocaleString("en-US")}</div>
        </div>
      </div>`).join("")
    : `<div class="notif-empty">No notifications yet.</div>`;
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
  const label = ticket.selections.length > 1
    ? `${ticket.selections.length}× accumulator`
    : `${ticket.selections[0].homeTeam} – ${ticket.selections[0].awayTeam}`;
  if (ticket.status === "won") {
    showToast("win", "Ticket won! 🎉", `${label} · +${usd(ticket.payout - ticket.stake)}`);
    fireConfetti();
  } else if (ticket.status === "lost") {
    showToast("loss", "Ticket lost", `${label} · −${usd(ticket.stake)}`);
  } else if (ticket.status === "push") {
    showToast("push", "Stake refunded", label);
  }
}

// ---------- return from Whop checkout (?paid=1) ----------
if (new URLSearchParams(window.location.search).get("paid") === "1") {
  showToast("win", "Payment received! 🎉", "We're setting up your account — everything will be ready in a moment.");
  // clean the parameter from the address so the toast does not pop up on refresh
  window.history.replaceState({}, "", "dashboard");
}

// ---------- badges: real conditions computed from portfolio data ----------
const BADGES = [
  ["First win", "b-prvni-vitezstvi", "b-prvni-vitezstvi"],
  ["5 in a row", "b-5-v-rade", "b-5-v-rade"],
  ["10 in a row", "b-10-v-rade", "b-10-v-rade"],
  ["Accumulator expert", "b-akumulator", "b-akumulator"],
  ["Phase 1 complete", "b-faze-1", "b-faze-1"],
  ["Phase 2 complete", "b-faze-2", "b-faze-2"],
  ["Funded player", "b-funded", "b-funded"],
  ["100 bets", "b-100-sazek", "b-100-sazek"],
  ["Hunter instinct", "b-lovecky", "b-lovecky"],
  ["Iron hand", "b-zelezna-ruka", "b-zelezna-ruka"],
  ["First payout", "b-prvni-vyber", "b-prvni-vyber"],
  // Ambassador vyžaduje systém doporučení hráčů, který zatím neexistuje
  // (affiliate systém dnes slouží jen content creatorům/promo kódům) — zůstává uzamčený.
  ["Ambassador", "b-ambasador", null],
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
  };
}

function renderBadges(state) {
  const badgeGrid = document.getElementById("badgeGrid");
  if (!badgeGrid) return;
  const unlocks = computeBadgeUnlocks(state);
  const unlockedCount = BADGES.filter(([, , key]) => key && unlocks[key]).length;
  const countEl = document.getElementById("badgeCount");
  if (countEl) countEl.textContent = `${unlockedCount} / ${BADGES.length}`;
  badgeGrid.innerHTML = BADGES.map(([name, img, key]) => {
    const unlocked = key ? !!unlocks[key] : false;
    return `<div class="badge-tile ${unlocked ? "unlocked" : ""}" title="${name}">
      <img src="assets/badges/${img}.png" alt="" />${name}
    </div>`;
  }).join("");
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
    el.textContent = `🔥 ${streaks.current}× wins in a row`;
    el.classList.remove("chip-momentum-cold");
  } else {
    el.textContent = `${streaks.current}× losses in a row`;
    el.classList.add("chip-momentum-cold");
  }
}

// ---------- portfolio: boots the simulation and settles tickets periodically ----------
Portfolio.ensure("advanced");
renderBadges(Portfolio.get());

async function refreshAfterSettlement() {
  const beforeState = Portfolio.get();
  const beforeStatus = beforeState ? Object.fromEntries(beforeState.tickets.map((t) => [t.id, t.status])) : {};
  const beforeUnlocks = beforeState ? computeBadgeUnlocks(beforeState) : {};

  await Portfolio.checkSettlements();

  const afterState = Portfolio.get();
  if (afterState) {
    afterState.tickets.forEach((t) => {
      if (beforeStatus[t.id] === "pending" && t.status !== "pending") {
        celebrateTicket(t);
      }
    });
    const afterUnlocks = computeBadgeUnlocks(afterState);
    BADGES.forEach(([name, , key]) => {
      if (key && afterUnlocks[key] && !beforeUnlocks[key]) {
        showToast("badge", "New badge! 🏅", name);
      }
    });
    renderBadges(afterState);
    renderMomentum(afterState);
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
  if (val) { score += Math.min(40, val * 20); reasons.push(`${val}× value-bet tiket`); }
  if (s.total >= 5 && s.avgOdds > 4) {
    score += 10;
    reasons.push(`průměrný kurz outlier (${s.avgOdds.toFixed(2)})`);
  }
  if (s.total >= 5 && state.tickets.every((t) => t.stake >= state.maxStake * 0.98)) {
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
  return { score: Math.min(100, score), reasons };
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
    state: breached ? "breached" : state.phase === "funded" ? "funded" : "active",
    balance: state.balance,
    profit: state.balance - state.cap,
    qualifyingTickets: Portfolio.countQualifyingTickets(state, state.phaseStartedAt),
    breachReason: breached ? breach.reason : null,
    flags,
    ticketsTotal: s.total,
    ticketsWon: s.won,
    riskScore: risk.score,
    riskReasons: risk.reasons,
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
  lastSyncAt = Date.now();
  try {
    const client = await FundlyBackend.getClient();
    if (!client) return;
    const { data } = await client.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) return; // demo režim / nepřihlášený
    const state = Portfolio.get();
    if (!state) return;
    await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/sync-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildAccountSnapshot(state)),
    });
  } catch (e) { /* sync je best-effort */ }
}

// při načtení dashboardu (případně přihlášeného) rovnou naplánujeme sync
scheduleAccountSync();

// ---------- limited dashboard: přihlášený uživatel bez aktivního účtu ----------
// Skryje hlavní navigaci a sekce, ukáže jen CTA na novou výzvu + minulé účty.
function showLimitedDashboard(accounts) {
  document.body.classList.add("limited");
  document.querySelectorAll(".dash-view").forEach((v) => { v.hidden = true; });
  const view = document.getElementById("view-noaccount");
  if (view) view.hidden = false;
  const list = document.getElementById("naAccounts");
  if (list) {
    const label = (s) => s === "funded" ? "Funded" : s === "active" ? "Active" : s === "breached" ? "Breached" : s;
    const tag = (s) => s === "funded" ? "win" : s === "active" ? "push" : "loss";
    list.innerHTML = accounts.map((a) => `
      <div class="k-row neutral">${a.package_key || "?"} · $${Number(a.capital || 0).toLocaleString("en-US")}
        <span class="n"><span class="tag ${tag(a.state)}">${label(a.state)}</span>
        <span style="color:var(--text-muted);font-size:.75rem">${new Date(a.created_at).toLocaleDateString("en-US")}</span></span>
      </div>`).join("");
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
      note.textContent = err.message || "The payment gateway could not be opened.";
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
      window.location.replace("./");
      return;
    }
    const { data: accounts, error } = await client
      .from("challenge_accounts")
      .select("package_key, capital, phase, state, flags, created_at, inactivity_warned_7, inactivity_warned_13, nickname, leaderboard_opt_in")
      .order("created_at", { ascending: false });
    if (error) return;
    if (!accounts || !accounts.length) {
      window.location.replace("checkout");
      return;
    }
    const account = accounts.find((a) => a.state === "active" || a.state === "funded");
    if (!account) {
      showLimitedDashboard(accounts);
      return;
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
      showToast("loss", "Last warning: place a bet", "No activity for 13+ days. The account will be closed after 14 days of inactivity.");
    } else if (account.state === "funded" && account.inactivity_warned_7) {
      showToast("pend", "Stay active", "No activity for 7+ days. Place at least one bet every 14 days to keep the account funded.");
    }

    const state = Portfolio.get();
    if (state && state.packageKey === account.package_key) return;
    // the paid package differs from the local one → boot the simulation with it
    Portfolio.init(account.package_key);
    if (typeof renderPrehled === "function") renderPrehled();
    if (typeof renderVykon === "function") renderVykon();
    if (typeof renderBankBar === "function") renderBankBar();
    showToast("win", "Account is active", `The ${packageByKey(account.package_key).name} package has been assigned.`);
  } catch (e) {
    // silent fallback to local data
  }
}
// js/config.js and js/whop.js load with defer → we run on DOMContentLoaded,
// when FundlyBackend/FundlyAuth are definitely available
window.addEventListener("DOMContentLoaded", syncChallengeAccount);

// ---------- betting (live data from odds-api.io) ----------
// API_BASE/API_KEY/BOOKMAKER/CACHE_TTL/cacheGet/cacheSet/cacheDrop/apiGet: see js/portfolio.js
const ODDS_MIN = 1.0;
const ODDS_MAX = 8.0;
const EVENTS_PER_SPORT = 25; // /odds/multi takes max 10 events per 1 request → batches below

// sports as on the original dashboard + added coverage (Betano)
const SPORTS = [
  ["basketball", "Basketball", "basketbal"],
  ["football", "Football", "fotbal"],
  ["ice-hockey", "Hockey", "hokej"],
  ["table-tennis", "Table tennis", "stolni-tenis"],
  ["tennis", "Tennis", "tenis"],
  ["darts", "Darts", "sipky"],
  ["mixed-martial-arts", "MMA", "mma"],
  ["boxing", "Boxing", ""], // no icon → letter chip
  ["volleyball", "Volleyball", "volejbal"],
];

let activeSport = "basketball";
let slip = []; // {id, match, pick, odds}
let sportEvents = []; // loaded matches of the active sport
const filters = { q: "", date: "", league: "", odds: "", live: false, high: false };

const sportTabs = document.getElementById("sportTabs");
const matchList = document.getElementById("matchList");
const slipBody = document.getElementById("slipBody");

// events + ML odds, 5 min cache (LIVE 1 min); odds fetch in batches of 10
// upcoming window: explicit `to` = now + 20 days (RFC3339 UTC)
async function loadSportEvents(sport, live) {
  const key = live ? sport + ":live" : sport;
  const cached = cacheGet(key, live ? 60 * 1000 : CACHE_TTL);
  if (cached) return cached;

  const events = live
    ? await apiGet("/events/live", { sport })
    : await apiGet("/events", {
        sport,
        status: "pending",
        limit: String(EVENTS_PER_SPORT),
        to: new Date(Date.now() + 20 * 864e5).toISOString(),
      });
  if (!events.length) { cacheSet(key, []); return []; }

  // základní eventy nesou live stav (clock/scores) — odds odpověď je nemá
  const baseById = Object.fromEntries(events.map((e) => [e.id, e]));
  const ids = events.map((e) => e.id).slice(0, EVENTS_PER_SPORT);
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) {
    chunks.push(await apiGet("/odds/multi", { eventIds: ids.slice(i, i + 10).join(","), bookmakers: BOOKMAKER }));
  }
  const withOdds = chunks.flat();

  const merged = withOdds
    .map((e) => {
      const base = baseById[e.id] || {};
      const markets = (e.bookmakers && e.bookmakers[BOOKMAKER]) || [];
      const ml = markets.find((m) => m.name === "ML");
      const row = ml && ml.odds && ml.odds[0];
      if (!row || !row.home || !row.away) return null;
      return {
        id: e.id,
        home: e.home,
        away: e.away,
        league: e.league ? e.league.name : "",
        date: e.date,
        live: !!live || base.status === "live" || !!(base.clock && base.clock.running),
        clock: base.clock || null,   // { minute, period, running, statusDetail }
        scores: base.scores || null, // { home, away } (případně periods.ft apod.)
        odds: [parseFloat(row.home), row.draw ? parseFloat(row.draw) : null, parseFloat(row.away)],
        markets: markets
          .filter((m) => Array.isArray(m.odds) && m.odds.length)
          .slice(0, 14), // all markets for the match detail
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
const MARKET_LABELS = {
  "ML": "Match winner",
  "Draw No Bet": "Draw no bet",
  "Double Chance": "Double chance",
  "Spread": "Asian handicap",
  "European Handicap": "European handicap",
  "Totals": "Total points (over / under)",
  "Goals Over/Under": "Goals (over / under)",
  "Both Teams To Score": "Both teams to score",
  "Spread HT": "Handicap · 1st half",
  "Totals HT": "Total · 1st half",
  "ML HT": "Winner · 1st half",
  "Corners": "Corners",
  "Correct Score": "Correct score",
};
const PICK_LABELS = { home: "1", draw: "X", away: "2", over: "Over", under: "Under", yes: "Yes", no: "No" };
const PICK_FIELDS = ["home", "draw", "away", "over", "under", "yes", "no"];

function marketLabel(name) { return MARKET_LABELS[name] || name; }

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
  sel.innerHTML = `<option value="">All leagues</option>` +
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
  const hm = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (today) return `Today ${hm}`;
  if (tomorrow) return `Tomorrow ${hm}`;
  return `${d.toLocaleDateString("en-US", { day: "numeric", month: "numeric" })} ${hm}`;
}

function renderSportTabs() {
  sportTabs.innerHTML = SPORTS.map(([slug, label, icon]) => `
    <button class="${slug === activeSport ? "active" : ""}" data-sport="${slug}" role="tab" aria-selected="${slug === activeSport}">
      ${icon
        ? `<img src="assets/sports/${icon}.png" alt="" />`
        : `<span class="ic-letter">${label[0]}</span>`}
      ${label}
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
  return list;
}

let detailMatch = null; // open match (master -> detail)
let openGroups = null; // expanded markets in the detail (kept across re-renders)

// row of odds buttons for one market (home/draw/away, over/under, yes/no…)
function marketRowButtons(m, marketName, row, ri) {
  const caption = row.label || (row.hdp !== undefined ? `Line ${row.hdp}` : "");
  const btns = PICK_FIELDS
    .filter((f) => row[f] !== undefined && row[f] !== null)
    .map((f) => {
      const val = parseFloat(row[f]);
      if (Number.isNaN(val)) return "";
      const id = `${m.id}|${marketName}|${ri}|${f}`;
      const sel = slip.some((s) => s.id === id);
      const out = !oddPlayable(val);
      const small = row.label ? "Odds" : (PICK_LABELS[f] || f);
      return `<button class="odd-btn ${sel ? "selected" : ""}" data-pick="${id}"
        ${out ? `disabled title="Odds outside the allowed range ${ODDS_MIN.toFixed(2)} to ${ODDS_MAX.toFixed(2)}"` : ""}>
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

  matchList.innerHTML = `
    <div class="detail-bar">
      <button class="filter-chip" id="backToList">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Back to matches
      </button>
    </div>
    <div class="detail-head">
      <div class="m-league">${m.league}</div>
      <div class="detail-teams">${m.home} <span>vs</span> ${m.away}</div>
      <div class="m-time">${m.live ? `<span class="live">● LIVE${liveScore(m)}</span>${liveClock(m) ? ` · ${liveClock(m)}` : ""} · ` : ""}${m.live ? "" : `${fmtTime(m.date)} · `}${m.markets.length} markets</div>
    </div>
    <div class="mk-accs">${groups || `<p class="bet-msg">No additional markets available.</p>`}</div>`;

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
}

function renderMatches() {
  const m = detailMatch && sportEvents.find((x) => x.id === detailMatch);
  if (m) { renderMatchDetail(m); return; }
  detailMatch = null;
  setBetChrome(false);

  const list = visibleEvents();
  document.getElementById("matchCount").textContent = String(list.length);
  if (!list.length) {
    matchList.innerHTML = `<p class="bet-msg">No matches match the filters.<br />Try another sport or clear the filters.</p>`;
    return;
  }
  matchList.innerHTML = list.map((m) => {
    const extra = m.markets.length - 1;
    return `
    <div class="match" data-match="${m.id}">
      <div class="match-head" role="button" tabindex="0" aria-label="Open match detail ${m.home} – ${m.away}">
        <div class="m-info">
          <div class="m-league">${m.league}</div>
          <div class="m-teams">${m.home} – ${m.away}</div>
          <div class="m-time">${m.live ? `<span class="live">● LIVE${liveScore(m)}</span>${liveClock(m) ? ` · ${liveClock(m)}` : ""}` : fmtTime(m.date)}${extra > 0 ? ` · +${extra} markets` : ""}</div>
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
              ${out ? `disabled title="Odds outside the allowed range ${ODDS_MIN.toFixed(2)} to ${ODDS_MAX.toFixed(2)}"` : ""}>
              <small>${lbl}</small><b>${o.toFixed(2)}</b>
            </button>`;
          }).join("")}
          <span class="m-chev" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        </div>
      </div>
    </div>`;
  }).join("");
}

// resolves a clicked pick by id `eventId|market|rowIdx|field`
function resolvePick(id) {
  const [eid, marketName, ri, field] = id.split("|");
  const m = sportEvents.find((x) => x.id === Number(eid));
  if (!m) return null;
  const mk = m.markets.find((x) => x.name === marketName);
  const row = mk && mk.odds[Number(ri)];
  if (!row) return null;
  const odds = parseFloat(row[field]);
  if (Number.isNaN(odds)) return null;
  let pick;
  if (marketName === "ML") {
    pick = PICK_LABELS[field] || field;
  } else if (row.label) {
    pick = `${marketLabel(marketName)}: ${row.label}`;
  } else {
    const hdp = row.hdp !== undefined ? ` ${row.hdp}` : "";
    pick = `${marketLabel(marketName)}${hdp}: ${PICK_LABELS[field] || field}`;
  }
  return {
    id, match: `${m.home} – ${m.away}`, pick, odds,
    eventId: Number(eid),
    sport: activeSport,
    league: m.league,
    homeTeam: m.home,
    awayTeam: m.away,
    startTime: m.date,
    marketName,
    field,
    hdp: row.hdp,
    oddValue: odds,
    pickLabel: pick,
  };
}

function renderError(err) {
  const msg = err && err.status === 429
    ? "API request limit reached. Try again in a moment."
    : "Matches could not be loaded.";
  matchList.innerHTML = `<p class="bet-msg">${msg}<br />
    <button class="btn btn-ghost" id="betRetry">Try again</button></p>`;
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
  document.getElementById("bankMaxStake").textContent = usd(state.maxStake);
  document.getElementById("bankOddsRange").textContent = `${ODDS_MIN.toFixed(2)} to ${ODDS_MAX.toFixed(2)}`;
}

function renderSlip() {
  if (!slip.length) {
    slipBody.innerHTML = `<p class="slip-empty"><img src="assets/fan-1.jpg" alt="" />Your ticket is empty.<br />Pick odds from the offer.</p>`;
    return;
  }
  const portfolio = Portfolio.ensure("advanced");
  const maxStake = portfolio.maxStake;
  const totalOdds = slip.reduce((a, s) => a * s.odds, 1);
  slipBody.innerHTML = `
    ${slip.map((s) => `
      <div class="slip-item">
        <span class="si-info">
          <span class="si-match">${s.match}</span><br />
          <span class="si-pick">Pick: ${s.pick}</span>
        </span>
        <span class="si-odds">${s.odds.toFixed(2)}</span>
        <button class="si-x" data-remove="${s.id}" aria-label="Remove">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("")}
    <div class="slip-total"><span>Total odds</span><b>${totalOdds.toFixed(2)}</b></div>
    <div class="field">
      <label for="stakeInput">Stake (max. ${usd(maxStake)})</label>
      <input class="input" id="stakeInput" type="number" min="5" max="${maxStake}" value="${Math.min(80, maxStake)}" />
    </div>
    <div class="slip-total"><span>Potential win</span><b class="green" id="potWin"></b></div>
    <button class="btn btn-primary" style="width:100%" id="placeBet">Place bet</button>
    <p class="auth-note mt" id="betNote" hidden></p>`;

  const stakeInput = document.getElementById("stakeInput");
  const potWin = document.getElementById("potWin");
  const updateWin = () => {
    let v = Math.min(Number(stakeInput.value) || 0, maxStake);
    potWin.textContent = usd(Math.round(v * totalOdds));
  };
  stakeInput.addEventListener("input", updateWin);
  updateWin();

  document.getElementById("placeBet").addEventListener("click", async () => {
    const note = document.getElementById("betNote");
    const btn = document.getElementById("placeBet");
    // value-bet flag (zakázaná strategie): pick je v odds-api value-bet
    // výpisu pro Betano. Endpoint je volitelný — chyba = žádný flag.
    let flags = [];
    try {
      const valueBets = await fetchValueBets();
      if (slip.some((s) => isValueBetSelection(valueBets, s))) flags = ["value"];
    } catch (e) { /* value-bets endpoint unavailable → skip silently */ }
    const result = Portfolio.placeBet(slip, Number(stakeInput.value), flags);
    if (!result.ok) {
      note.textContent = result.error;
      note.hidden = false;
      return;
    }
    note.textContent = "Ticket accepted! Track it in the Overview.";
    note.hidden = false;
    btn.disabled = true;
    scheduleAccountSync();
    setTimeout(() => {
      slip = [];
      renderMatches();
      renderSlip();
      renderBankBar();
    }, 900);
  });
}

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
      detailMatch = Number(head.closest("[data-match]").dataset.match);
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
    detailMatch = Number(head.closest("[data-match]").dataset.match);
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

// ---------- leaderboard: real ranking from leaderboard-get ----------
let lbMetric = "profit";
let lbRows = [];

async function loadLeaderboard() {
  const el = document.getElementById("lbList");
  if (!el) return;
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
    el.innerHTML = `<p class="bet-msg">Leaderboard needs the backend — sign in first.</p>`;
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
    el.innerHTML = `<p class="bet-msg">Leaderboard could not be loaded.</p>`;
  }
}

function renderLb() {
  const el = document.getElementById("lbList");
  if (!el) return;
  if (!lbRows.length) {
    el.innerHTML = `<p class="bet-msg">No shared results yet — be the first on the board.</p>`;
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
      <span class="lb-name">${r.name}${r.isMe ? " · you" : ""}<small>${packageByKey(r.packageKey || "").name}</small></span>
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
if (document.getElementById("lbList")) loadLeaderboard();

// ---------- payouts ----------
// Status labels of the withdrawal history (values are written by the request-payout / whop-payout edge functions).
const WD_STATUS = {
  pending: { tag: "pend", label: "Awaiting approval" },
  approved: { tag: "pend", label: "Approved" },
  paid: { tag: "win", label: "Paid out" },
  sent: { tag: "win", label: "Paid out" },
  failed: { tag: "loss", label: "Failed" },
  rejected: { tag: "loss", label: "Rejected" },
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
    const hasPaid = (payouts || []).some((p) => p.status === "paid" || p.status === "sent");
    if (hasPaid) {
      const state = Portfolio.get();
      if (state && !state.hasPayout) {
        state.hasPayout = true;
        Portfolio.save(state);
        renderBadges(state);
      }
    }

    if (!payouts || !payouts.length) {
      box.innerHTML = `<p class="slip-empty">No withdrawals yet.</p>`;
      return;
    }
    box.innerHTML = payouts.map((p) => {
      const s = WD_STATUS[p.status] || { tag: "pend", label: String(p.status) };
      const date = new Date(p.created_at).toLocaleDateString("en-US");
      return `<div class="k-row neutral">${date} · ${p.method || "—"}<span class="n"><span class="tag ${s.tag}">${s.label}</span> ${usd(Number(p.amount) || 0)}</span></div>`;
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
          note.textContent = "The minimum withdrawal is $10.";
          note.hidden = false;
          return;
        }
        if (amount > 4000) {
          note.textContent = "The maximum withdrawal per request is $4,000.";
          note.hidden = false;
          return;
        }
        if (!method) {
          note.textContent = "Choose a payout method.";
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
            ? "Your withdrawal request was submitted for approval."
            : data.error || "The request could not be submitted.";
          note.hidden = false;
          if (ok) {
            wdForm.reset();
            loadPayoutHistory();
          }
        } catch (err) {
          note.textContent = "The request could not be submitted.";
          note.hidden = false;
        }
        return;
      }
    }
    note.textContent = "Withdrawals unlock with a funded account after completing both phases.";
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
  all: "All packages",
  starter: "Starter",
  standard: "Standard",
  advanced: "Advanced",
  pro: "Pro",
  elite: "Elite",
};

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
    dstat("Active codes", active.length, false) +
    dstat("Conversions", data.totals.conversions, false) +
    dstat("Estimated earnings", usd(data.totals.earnings), true);

  codes.innerHTML = data.codes.length
    ? data.codes.map((c) => {
        const limit = c.usageLimit == null ? "∞" : c.usageLimit;
        const state = c.active
          ? `<span class="tag win">active</span>`
          : `<span class="tag loss">archived</span>`;
        return `<div class="k-row neutral"><span><b>${esc(c.code)}</b> · ${esc(AFF_PLAN_LABELS[c.planKey] || c.planKey)} · −${c.discountPct} % for buyers<br><span style="color:var(--text-muted);font-size:.8125rem">Your commission ${c.commissionPct} % · used ${c.used} / ${limit}</span></span><span class="n">${state} ${usd(c.earnings)}</span></div>`;
      }).join("")
    : `<p class="bet-msg">No affiliate code is linked to your account yet. Reach out to support to join the program.</p>`;

  referrals.innerHTML = data.referrals.length
    ? data.referrals.map((r) => {
        const date = new Date(r.date).toLocaleDateString("en-US");
        const tickets = r.ticketsCapped ? "5+" : String(r.tickets);
        const amt = r.currency === "eur"
          ? `${(Number(r.amount) || 0).toLocaleString("en-US")} €`
          : usd(Number(r.amount) || 0);
        return `<tr>
          <td>${esc(r.email)}</td>
          <td>${esc(AFF_PLAN_LABELS[r.packageKey] || r.packageKey || "?")}</td>
          <td class="odds">${esc(r.code)}</td>
          <td class="odds">${tickets}</td>
          <td class="odds">${amt}</td>
          <td style="color:var(--text-muted)">${date}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No referred players yet.</td></tr>`;
}

async function loadAffiliateStats() {
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
    return renderAffiliateMessage("Affiliate stats need the backend — this page is running in demo mode.");
  }
  try {
    const client = await FundlyBackend.getClient();
    if (!client) return renderAffiliateMessage("Affiliate stats need the backend.");
    const { data: sessionData } = await client.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return renderAffiliateMessage("Sign in to see your affiliate stats.");
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/affiliate-stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: "{}",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return renderAffiliateMessage(data.error || "Affiliate stats could not be loaded.");
    renderAffiliate(data);
  } catch (e) {
    renderAffiliateMessage("Affiliate stats could not be loaded.");
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
        throw new Error("Support is temporarily unavailable — please email us directly.");
      }
      const client = await FundlyBackend.getClient();
      const user = client ? (await client.auth.getUser()).data.user : null;
      const session = client ? (await client.auth.getSession()).data.session : null;
      if (!user) throw new Error("Please sign in first.");
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
      if (!res.ok) throw new Error(data.error || "The message could not be sent.");
      supportForm.reset();
      note.textContent = "Message sent — we'll get back to you by email.";
      note.hidden = false;
    } catch (err) {
      note.textContent = err.message || "The message could not be sent.";
      note.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

// nastavení leaderboardu (přezdívka + sdílení) — uloží se přes profile-update
async function saveProfileSetting(patch) {
  const client = await FundlyBackend.getClient();
  const session = client ? (await client.auth.getSession()).data.session : null;
  if (!session) throw new Error("Please sign in first.");
  const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/profile-update`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(patch),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save.");
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
      nickSave.textContent = "Saved";
    } catch (e) {
      nickSave.textContent = "Failed";
    }
    setTimeout(() => { nickSave.textContent = "Save"; nickSave.disabled = false; }, 1500);
  });
}

// ---------- overview: render from the real portfolio state ----------
// Equity chart: balance curve + dashed levels (phase target, fixed drawdown
// floor) with labels and a purple area under the curve. Data = state.equityHistory,
// only the presentation changes.
function renderEquityChart(state) {
  const points = state.equityHistory;
  if (points.length < 2) {
    return `<p class="bet-msg">The chart fills in once the first placed and settled ticket comes through.</p>`;
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
    targetAbs !== null ? { v: targetAbs, cls: "eq-lv-target", label: `Target ${usd(targetAbs)}` } : null,
    { v: floor, cls: "eq-lv-floor", label: `Floor ${usd(floor)}` },
  ].filter(Boolean);
  // labels must not overlap — sort by y and enforce a minimum gap
  levels.sort((a, b) => Y(a.v) - Y(b.v));
  let prevY = -Infinity;
  levels.forEach((lv) => {
    lv.y = Math.max(Y(lv.v), prevY + 11);
    prevY = lv.y;
  });

  const area = `${padL},${(h - padB).toFixed(1)} ` + coords.join(" ") + ` ${lastX.toFixed(1)},${(h - padB).toFixed(1)}`;
  const fmtDay = (t) => new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "numeric" });

  return `
    <svg viewBox="0 0 ${w} ${h}" class="equity-svg" role="img" aria-label="Balance history chart">
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
      ${targetAbs !== null ? '<span><i class="sw eq-lv-target"></i>Phase target</span>' : ""}
      <span><i class="sw eq-lv-floor"></i>Max. loss (${dd.trailing ? "trailing" : "fixed"} floor)</span>
      <span class="eq-dates">${fmtDay(points[0].t)} – ${fmtDay(points[points.length - 1].t)}</span>
    </div>`;
}

// warning tagy zakázaných strategií na tiketu (flags: ["arbitrage","value"])
function flagTags(t) {
  if (!t.flags || !t.flags.length) return "";
  return t.flags.map((f) =>
    `<span class="tag flag">${f === "arbitrage" ? "⚠ arbitrage" : "⚠ value bet"}</span>`
  ).join(" ");
}

// status → [tag class, label] (cashedout = early cashout, vlastní tag)
function ticketTag(t) {
  if (t.status === "won") return ["win", "Won"];
  if (t.status === "lost") return ["loss", "Lost"];
  if (t.status === "push") return ["push", "Refunded"];
  if (t.status === "cashedout") return ["push", "Cashed out"];
  return ["pend", "Pending"];
}

// rozbalovací detail čekajícího tiketu: výběry, kurzy, vklad, možná výhra,
// early cashout (90 % vkladu — bez dat o pohybu kurzů, poctivě popsané)
function ticketDetailHtml(t) {
  const potWin = Math.round(t.stake * t.combinedOdds);
  const cashout = Math.round(t.stake * 0.9);
  return `
    <div class="tk-sels">
      ${t.selections.map((s) => `
        <div class="tk-sel"><span>${s.homeTeam} – ${s.awayTeam} · ${s.pickLabel || s.field}</span><span class="n">${s.oddValue.toFixed(2)}</span></div>`).join("")}
    </div>
    <div class="tk-meta">
      <span>Stake <b>${usd(t.stake)}</b></span>
      <span>Odds <b>${t.combinedOdds.toFixed(2)}</b></span>
      <span>Potential win <b class="green">${usd(potWin)}</b></span>
    </div>
    <button class="btn btn-ghost" data-cashout="${t.id}">Cash out now for ${usd(cashout)} (early settlement −10 %)</button>`;
}

function renderRecentTickets(state) {
  const recent = state.tickets.slice(0, 5);
  if (!recent.length) {
    return `<p class="bet-msg">No tickets yet. Place your first one in the Betting section.</p>`;
  }
  return recent.map((t) => {
    const label = t.selections.length > 1
      ? `${t.selections.length}× accumulator`
      : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`;
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
  const phaseLabel = state.phase === "funded" ? "Funded account" : `Phase ${state.phase}`;
  document.getElementById("ovSubtitle").textContent = `${phaseLabel} · Fundly Challenge`;
  document.getElementById("ovPhaseChip").textContent = phaseLabel;
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
  const deltaFmt = `${sign}$${Math.abs(Math.round(profit)).toLocaleString("en-US")} · ${sign}${Math.abs(deltaPct).toLocaleString("en-US", { maximumFractionDigits: 2 })} %`;
  document.getElementById("balanceCard").innerHTML = `
    <div class="balance-top">
      <div>
        <div class="bc-plan">Account balance</div>
        <div class="bc-amount">${usd(state.balance)}</div>
        <div class="bc-delta ${profit >= 0 ? "pos" : "neg"}">${deltaFmt} in this phase</div>
      </div>
      <div class="bc-chips">
        <span class="chip-phase">${phaseLabel}</span>
        <span class="chip-ghost">${state.packageName} · ${state.profitSplit} % share</span>
      </div>
    </div>
    <div class="bc-chart">${renderEquityChart(state)}</div>`;

  document.getElementById("ovStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Profit</div>
      <div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${usd(s.netProfit)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.8"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg></span>To target</div>
      <div class="val">${state.phase === "funded" ? "—" : usd(toGoal)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M4.5 2h6v4a3 3 0 01-6 0V2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 9v2.5M5 13h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>Wins</div>
      <div class="val">${s.won} <small>/ ${s.won + s.lost}</small></div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 5a1.5 1.5 0 001.5-1.5h8A1.5 1.5 0 0013 5v1.6a1.9 1.9 0 000 3.8V12a1.5 1.5 0 00-1.5 1.5h-8A1.5 1.5 0 002 12V5z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" transform="translate(0,-1.2)"/></svg></span>Tickets</div>
      <div class="val">${s.total}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 4.5v3.3l2.2 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Win rate</div>
      <div class="val ${s.winRate >= 50 ? "green" : ""}">${s.winRate} %</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 12.5l4-8 3 5 4-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Avg. odds</div>
      <div class="val">${s.avgOdds.toFixed(2)}</div>
    </div>`;

  document.getElementById("recentTickets").innerHTML = renderRecentTickets(state);

  const dd = Portfolio.drawdownInfo(state);
  const dl = Portfolio.dailyLossInfo(state);

  // right column: rules and limits with thin progress bars
  const meta = packageMeta(packageByKey(state.packageKey));
  const pctTime = Math.max(0, Math.min(100, Math.round((daysLeft / 30) * 100)));
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
    <h3>Rules at a glance</h3>
    ${state.phase === "funded"
      ? rrRow("Phase target", "Completed", null, "", "Funded account — no target, unlimited time")
      : rrRow("Phase target", `${usd(Math.max(0, profit))} / ${usd(target)}`, pct, pct >= 100 ? "" : "", pct >= 100 ? "Completed" : `${usd(toGoal)} to go`)}
    ${rrRow(dd.trailing ? "Max. loss (trailing)" : "Max. loss (static)", `${usd(Math.round(dd.remaining))} / ${usd(state.drawdown)}`, Math.round(dd.pct), ddTone,
      dd.trailing ? `Floor follows your highest balance (${usd(dd.floor)})` : `Fixed floor ${usd(dd.floor)} — it never moves`)}
    ${rrRow("Max. daily loss", `${usd(Math.round(dl.remaining))} / ${usd(dl.limit)} today`, pctDaily, dlTone, "Resets at midnight UTC")}
    ${state.phase === "funded" ? "" : rrRow("Time limit", `${daysLeft} / 30 days`, pctTime, pctTime < 25 ? "danger" : "", "")}
    ${rrRow("Qualifying tickets", `${Math.min(qual, meta.qualifyingTickets)} / ${meta.qualifyingTickets}`, pctTickets, "", "Winning tickets with net profit ≥ +0.5 % of capital")}
    ${rrRow("Max. stake", usd(state.maxStake), null, "", "Per single ticket")}
    ${rrRow("Odds", `${ODDS_MIN.toFixed(2)} – ${ODDS_MAX.toFixed(2)}`, null, "", "")}
    ${rrRow("Profit split", `${state.profitSplit} %`, null, "", "Your share of the profit")}
    <div class="rr-phase">
      <span class="rr-phase-label">Phase</span>
      <span class="rr-phase-name">${phaseLabel}</span>
      <span class="rr-phase-sub">Started ${new Date(state.phaseStartedAt).toLocaleDateString("en-US")}${state.phase === "funded" ? "" : ` · ${daysLeft} days left`}</span>
    </div>`;

  document.getElementById("ovLimity").innerHTML = `
    <div class="limit-row">
      <span class="k">Max. total loss <small>(${dd.trailing ? "trailing" : "static"}, floor: ${usd(dd.floor)})</small></span>
      <span class="v">${usd(Math.round(dd.remaining))} left</span>
    </div>
    <div class="dd-bar">
      <span class="cap lo">Floor: ${Math.round(dd.floor).toLocaleString("en-US")}</span>
      <span class="cursor" style="left:${dd.pct}%"></span>
      <span class="cap hi">${Math.round(state.balance).toLocaleString("en-US")}</span>
    </div>
    <div class="limit-row" style="margin-top:14px">
      <span class="k">Max. daily loss <small>(resets at midnight UTC)</small></span>
      <span class="v">${usd(Math.round(dl.remaining))} / ${usd(dl.limit)} left</span>
    </div>
    <div class="limit-row">
      <span class="k">Qualifying tickets <small>(winning, profit ≥ +0.5 % of capital)</small></span>
      <span class="v">${Math.min(qual, meta.qualifyingTickets)} / ${meta.qualifyingTickets}</span>
    </div>
    <div class="limit-row">
      <span class="k">Profit withdrawal <small>(funded account)</small></span>
      <span class="v">80 % of profit · max $4,000</span>
    </div>`;

  document.getElementById("ovPravidla").innerHTML = `
    <div class="rules-grid">
      <div class="rule-tile"><div class="k">Profit split</div><div class="v green">${state.profitSplit} %</div></div>
      <div class="rule-tile"><div class="k">Max. stake</div><div class="v">${usd(state.maxStake)}</div></div>
      <div class="rule-tile"><div class="k">Odds</div><div class="v">${ODDS_MIN.toFixed(2)} to ${ODDS_MAX.toFixed(2)}</div></div>
      <div class="rule-tile"><div class="k">Max. loss</div><div class="v">${usd(state.drawdown)}</div></div>
      <div class="rule-tile"><div class="k">Max. daily loss</div><div class="v">${usd(dl.limit)}</div></div>
      <div class="rule-tile"><div class="k">Time limit</div><div class="v">30 days / phase</div></div>
      <div class="rule-tile"><div class="k">Qualifying tickets</div><div class="v">5 × ≥ +0.5 %</div></div>
      <div class="rule-tile"><div class="k">Profit withdrawal</div><div class="v">80 % of profit</div></div>
      <div class="rule-tile"><div class="k">Max. payout</div><div class="v">$4,000</div></div>
    </div>`;

  const steps = [
    { title: "Phase 1 · Fundly Challenge", desc: `Target +${usd(state.target1)}`, img: "assets/journey-phase1.jpg" },
    { title: "Phase 2 · Verification", desc: `Target +${usd(state.target2)}`, img: "assets/journey-phase2.jpg" },
    { title: "Funded account", desc: `${state.profitSplit} % profit share, unlimited time, regular payouts.`, img: "assets/journey-funded.jpg" },
  ];
  const currentIndex = state.phase === "funded" ? 2 : state.phase - 1;
  document.getElementById("ovCesta").innerHTML = `<div class="journey">${steps.map((step, i) => {
    const cls = i < currentIndex ? "done" : i === currentIndex ? "now" : "";
    const dot = i < 2 ? String(i + 1) : "✓";
    const desc = i === currentIndex && state.phase !== "funded"
      ? `${step.desc}, currently in progress. You have ${pct} % completed.`
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

// ---------- payouts: payout conditions (funded account) ----------
// Per the rules doc: (1) profit buffer +5 % of capital — ONE-TIME at the start
// of the funded phase (once the high-water mark passes it, it stays met);
// (2) 5 qualifying tickets (winning, net profit ≥ +0.5 % of capital) BEFORE
// EVERY payout — the counter resets after each payout request;
// (3) payout = 80 % of profit since the last payout, max $4,000 flat.
function renderPayoutConds(state) {
  const el = document.getElementById("wdConds");
  if (!el) return;
  if (state.phase !== "funded") {
    el.innerHTML = `<p class="t-meta" style="margin-top:10px">Withdrawals unlock with a funded account. Once funded, build a one-time profit buffer of +5 % of capital; before every payout you then need 5 winning tickets with a net profit of at least +0.5 % of capital (the counter resets after each payout). Payout is 80 % of your profit, max. $4,000.</p>`;
    return;
  }
  const meta = packageMeta(packageByKey(state.packageKey));
  const bufferNeed = Math.round(state.cap * (meta.payoutBufferPct / 100));
  // buffer je jednorázový: stačí, když ho někdy překročil high-water mark
  const bufferMet = state.hwm >= state.cap + bufferNeed;
  const profit = Math.max(0, state.balance - state.cap);
  const qual = Portfolio.countQualifyingTickets(state, state.lastPayoutAt || state.phaseStartedAt);
  el.innerHTML = `
    <div class="k-rows" style="margin-top:12px">
      <div class="k-row neutral">Profit buffer (one-time, +${meta.payoutBufferPct} % of capital)<span class="n ${bufferMet ? "green" : ""}">${bufferMet ? "Done" : `${usd(profit)} / ${usd(bufferNeed)}`}</span></div>
      <div class="k-row neutral">Qualifying tickets (reset each payout)<span class="n ${qual >= meta.qualifyingTickets ? "green" : ""}">${Math.min(qual, meta.qualifyingTickets)} / ${meta.qualifyingTickets}</span></div>
      <div class="k-row neutral">Payout<span class="n">80 % of profit · max $4,000</span></div>
    </div>`;
}

// ---------- profile: account panel + limits from the real portfolio state ----------
function renderProfile(state) {
  if (!document.getElementById("pfName")) return;
  const s = Portfolio.summary(state);
  const dd = Portfolio.drawdownInfo(state);
  const target = Portfolio.phaseTarget(state);
  const profit = state.balance - state.phaseBaseline;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((profit / target) * 100))) : 100;
  const phaseLabel = state.phase === "funded" ? "Funded account" : `Phase ${state.phase}`;
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
    set("pfGoalLabel", "Funded account");
    set("pfGoalPct", "No target");
    document.getElementById("pfGoalBar").style.width = "100%";
    set("pfGoalMeta", "Unlimited time, regular payouts.");
  } else {
    set("pfGoalLabel", `Progress to target (${usd(state.phaseBaseline + target)})`);
    set("pfGoalPct", `${pct} %`);
    document.getElementById("pfGoalBar").style.width = pct + "%";
    set("pfGoalMeta", `${usd(Math.max(0, target - profit))} to target · ${Portfolio.daysRemaining(state)} days left`);
  }

  set("pfDdDetail", dd.trailing ? `(trailing floor ${usd(dd.floor)})` : `(fixed floor ${usd(dd.floor)})`);
  set("pfDdRemain", `${usd(Math.round(dd.remaining))} left`);
  document.getElementById("pfDdBar").style.width = Math.round(dd.pct) + "%";

  const dl = Portfolio.dailyLossInfo(state);
  const daysLeft = Portfolio.daysRemaining(state);
  set("pfDaysLeft", state.phase === "funded" ? "Unlimited" : `${daysLeft} days`);
  const deadline = new Date(new Date(state.phaseStartedAt).getTime() + 30 * 86400000);
  set("pfDeadline", state.phase === "funded"
    ? "A funded account has no time limit"
    : `Left until the end of the phase · Deadline: ${deadline.toLocaleDateString("en-US")}`);

  const rules = document.getElementById("pfRules");
  if (rules) rules.innerHTML = `
    <div class="rule-tile"><div class="k">Profit split</div><div class="v green">${state.profitSplit} %</div></div>
    <div class="rule-tile"><div class="k">Max. stake</div><div class="v">${usd(state.maxStake)}</div></div>
    <div class="rule-tile"><div class="k">Odds</div><div class="v">${ODDS_MIN.toFixed(2)} to ${ODDS_MAX.toFixed(2)}</div></div>
    <div class="rule-tile"><div class="k">Max. loss</div><div class="v">${usd(state.drawdown)}</div></div>
    <div class="rule-tile"><div class="k">Max. daily loss</div><div class="v">${usd(dl.limit)}</div></div>
    <div class="rule-tile"><div class="k">Time limit</div><div class="v">30 days / phase</div></div>
    <div class="rule-tile"><div class="k">Qualifying tickets</div><div class="v">5 × ≥ +0.5 %</div></div>
    <div class="rule-tile"><div class="k">Profit withdrawal</div><div class="v">80 % of profit</div></div>
    <div class="rule-tile"><div class="k">Max. payout</div><div class="v">$4,000</div></div>`;
}

// ---------- performance: render from the real portfolio state ----------
function renderVykon() {
  const view = document.getElementById("view-vykon");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  document.getElementById("vykonSubtitle").textContent = `${state.packageName} package statistics`;
  const s = Portfolio.summary(state);

  document.getElementById("vykonStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Current profit</div>
      <div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${usd(s.netProfit)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M4.5 2h6v4a3 3 0 01-6 0V2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7.5 9v2.5M5 13h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></span>Win rate</div>
      <div class="val ${s.winRate >= 50 ? "green" : ""}">${s.winRate} %</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 12.5l4-8 3 5 4-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Average odds</div>
      <div class="val">${s.avgOdds.toFixed(2)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 4.5v3.3l2.2 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Pending</div>
      <div class="val">${s.pending}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5v12M10.5 4.5c0-1.2-1.3-2-3-2s-3 .8-3 2 1.3 2 3 2 3 .8 3 2-1.3 2-3 2-3-.8-3-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></span>Staked</div>
      <div class="val">${usd(s.staked)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 7-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Returned</div>
      <div class="val ${s.returned >= s.staked && s.staked > 0 ? "green" : ""}">${usd(s.returned)}</div>
    </div>`;

  document.getElementById("vykonBreakdown").innerHTML = `
    <div class="k-row win">Won<span class="n">${s.won}</span></div>
    <div class="k-row loss">Lost<span class="n">${s.lost}</span></div>
    <div class="k-row pend">Pending<span class="n">${s.pending}</span></div>`;

  document.getElementById("vykonFinancials").innerHTML = `
    <div class="k-row neutral">Staked<span class="n">${usd(s.staked)}</span></div>
    <div class="k-row neutral">Returned<span class="n">${usd(s.returned)}</span></div>
    <div class="k-row neutral">Net profit<span class="n ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${usd(s.netProfit)}</span></div>`;

  const days = Portfolio.dailyNet(state, 7);
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  document.getElementById("vykonBarChart").innerHTML = days.map((d) => {
    const heightPct = d.net === 0 ? 4 : Math.max(6, Math.round((Math.abs(d.net) / maxAbs) * 100));
    const cls = d.net > 0 ? "pos" : d.net < 0 ? "neg" : "";
    return `<div class="bc-col"><span class="bar ${cls}" style="height:${heightPct}%"></span><span class="d">${d.label}</span></div>`;
  }).join("");

  const recent = state.tickets.slice(0, 8);
  document.getElementById("vykonTicketTable").innerHTML = recent.length ? recent.map((t) => {
    const label = t.selections.length > 1
      ? `${t.selections.length}× accumulator`
      : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`;
    const tip = t.selections.length > 1 ? "AKU" : (t.selections[0].pickLabel || "");
    const [tag, tagText] = ticketTag(t);
    // čekající tiket: kliknutelný řádek + skrytý detail s cashoutem
    if (t.status === "pending") {
      return `<tr class="tk-exp" data-tkexp="${t.id}" title="Show ticket detail"><td>${label}</td><td>${tip}</td><td class="odds">${t.combinedOdds.toFixed(2)}</td><td>${usd(t.stake)}</td><td>${flagTags(t)}<span class="tag ${tag}">${tagText}</span></td></tr>` +
        `<tr class="tk-detail" hidden><td colspan="5">${ticketDetailHtml(t)}</td></tr>`;
    }
    return `<tr><td>${label}</td><td>${tip}</td><td class="odds">${t.combinedOdds.toFixed(2)}</td><td>${usd(t.stake)}</td><td>${flagTags(t)}<span class="tag ${tag}">${tagText}</span></td></tr>`;
  }).join("") : `<tr><td colspan="5">No tickets yet.</td></tr>`;
}
