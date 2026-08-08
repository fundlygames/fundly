/* Fundly admin — finance, hráči, diagnostika (interní, mock data) */

const czk = (n) => n.toLocaleString("cs-CZ") + " Kč";

// ---------- přepínání sekcí ----------
const views = ["finance", "hraci", "affiliate", "diagnostika"];

function showView(name) {
  views.forEach((v) => {
    document.getElementById(`view-${v}`).hidden = v !== name;
  });
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-view]");
  if (nav) showView(nav.dataset.view);
});

// ---------- Finance: mock data ----------
const REVENUE_WEEKS = [
  { label: "T-9", value: 212000 },
  { label: "T-8", value: 198500 },
  { label: "T-7", value: 245100 },
  { label: "T-6", value: 261800 },
  { label: "T-5", value: 233400 },
  { label: "T-4", value: 279600 },
  { label: "T-3", value: 301200 },
  { label: "T-2", value: 287900 },
  { label: "T-1", value: 312400 },
  { label: "T", value: 328650 },
];

const FIN_BREAKDOWN = [
  ["Poplatky za výzvy", 968200],
  ["Obnovy účtu (reset)", 142850],
  ["Doplňky balíčků", 173600],
];

const FIN_PAYOUTS = [
  ["Hráč #a71f", 42300, "win", "vyplaceno"],
  ["Hráč #9c02", 18750, "win", "vyplaceno"],
  ["Hráč #f4e8", 61900, "pend", "zpracovává se"],
  ["Hráč #2b6a", 27480, "win", "vyplaceno"],
  ["Hráč #d190", 9640, "pend", "zpracovává se"],
];

const FIN_CHANNELS = [
  ["Google Ads", 68400, 312, 219, 4.8],
  ["Meta Ads", 54900, 287, 191, 5.6],
  ["Affiliate program", 41200, 198, 208, 6.1],
  ["Organic / SEO", 8900, 164, 54, 7.3],
  ["Influenceři", 13520, 89, 152, 3.9],
];

function renderLineChart(points, colorUp, colorDown) {
  const w = 600, h = 140, pad = 8;
  const values = points.map((p) => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (p.value - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = values[values.length - 1] >= values[0] ? colorUp : colorDown;
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="equity-svg" role="img" aria-label="Graf vývoje">
      <polyline points="${coords.join(" ")}" fill="none" stroke="${stroke}" style="color:${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <div class="equity-range"><span>${czk(min)}</span><span>${czk(max)}</span></div>`;
}

function renderFinance() {
  const revenue = FIN_BREAKDOWN.reduce((a, [, v]) => a + v, 0);
  const payouts = 412380;
  const marketing = FIN_CHANNELS.reduce((a, [, spend]) => a + spend, 0);
  const netProfit = revenue - payouts - marketing;

  document.getElementById("finStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Tržby</div>
      <div class="val green">${czk(revenue)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="3.5" width="12" height="8.5" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M9.5 7.75h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></span>Vyplaceno hráčům</div>
      <div class="val">${czk(payouts)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 4.5l5 3 6-3M2 4.5v6l5 3 6-3v-6M7 7.5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Marketing</div>
      <div class="val">${czk(marketing)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 7.5l1.5 1.5 2.5-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Čistý zisk</div>
      <div class="val green">${czk(netProfit)}</div>
    </div>`;

  document.getElementById("finRevenueChart").innerHTML = renderLineChart(REVENUE_WEEKS, "var(--accent)", "#ff6b6b");

  document.getElementById("finBreakdown").innerHTML = FIN_BREAKDOWN.map(([name, val]) =>
    `<div class="k-row neutral">${name}<span class="n">${czk(val)}</span></div>`
  ).join("");

  document.getElementById("finPayouts").innerHTML = FIN_PAYOUTS.map(([who, amount, tag, label]) =>
    `<div class="k-row neutral">${who}<span class="n"><span class="tag ${tag}">${label}</span> ${czk(amount)}</span></div>`
  ).join("");

  document.getElementById("finChannelsTable").innerHTML = `
    <thead><tr><th>Kanál</th><th>Výdaje</th><th>Registrace</th><th>CAC</th><th>Konverze</th></tr></thead>
    <tbody>
      ${FIN_CHANNELS.map(([name, spend, signups, cac, conv]) => `
        <tr>
          <td>${name}</td>
          <td class="odds">${czk(spend)}</td>
          <td class="odds">${signups}</td>
          <td class="odds">${czk(cac)}</td>
          <td class="odds">${conv.toFixed(1)} %</td>
        </tr>`).join("")}
    </tbody>`;
}

// ---------- Hráči: mock data ----------
const SIGNUP_WEEKS = [
  { label: "T-7", value: 142 },
  { label: "T-6", value: 168 },
  { label: "T-5", value: 155 },
  { label: "T-4", value: 201 },
  { label: "T-3", value: 189 },
  { label: "T-2", value: 224 },
  { label: "T-1", value: 210 },
  { label: "T", value: 246 },
];

const PLAYERS = [
  ["Tomáš Bartoš", "Advanced", "Fáze 2", 54210, 4210, 58, "aktivni", "před 20 min"],
  ["Lucie Nováková", "Starter", "Fáze 1", 11480, -1020, 41, "aktivni", "před 40 min"],
  ["Marek Sýkora", "Pro", "Financovaný", 98760, 18760, 63, "funded", "před 2 h"],
  ["Petra Dvořáková", "Advanced", "Fáze 1", 8340, -3660, 33, "breached", "před 3 h"],
  ["Ján Kováč", "Pro", "Fáze 2", 71920, 9920, 55, "aktivni", "před 5 h"],
  ["Barbora Horáková", "Starter", "Financovaný", 42100, 7100, 61, "funded", "před 6 h"],
  ["Filip Krejčí", "Advanced", "Fáze 1", 6210, -2790, 29, "breached", "před 1 d"],
  ["Zuzana Poláková", "Pro", "Fáze 2", 63480, 5480, 52, "aktivni", "před 2 d"],
  ["David Procházka", "Starter", "Fáze 1", 12990, 990, 47, "aktivni", "před 3 d"],
  ["Kristína Bendová", "Advanced", "Financovaný", 115320, 25320, 67, "funded", "před 1 d"],
];

const PLAYER_STATUS = {
  aktivni: { tag: "push", label: "Aktivní" },
  funded: { tag: "win", label: "Financovaný" },
  breached: { tag: "loss", label: "Breached" },
};

let playersFilter = "vse";

function renderPlayers() {
  const total = 4812, active = 1096, funded = 268, breachedThisMonth = 84;
  document.getElementById("playersStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="5.5" cy="4.75" r="2.25" stroke="currentColor" stroke-width="1.4"/><circle cx="10.5" cy="5.5" r="1.75" stroke="currentColor" stroke-width="1.4"/><path d="M1.5 13c.6-2.2 2.3-3.4 4-3.4S8.9 10.8 9.5 13M9 9.7c1.5.1 2.9 1.2 3.5 3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>Registrovaní celkem</div>
      <div class="val">${total.toLocaleString("cs-CZ")}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 4.5v3.3l2.2 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Aktivní výzvy</div>
      <div class="val">${active.toLocaleString("cs-CZ")}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5l1.8 3.8 4.2.6-3 3 .7 4.1-3.7-2-3.7 2 .7-4.1-3-3 4.2-.6z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg></span>Financovaní hráči</div>
      <div class="val green">${funded.toLocaleString("cs-CZ")}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.8L1.8 12.7h11.4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.5 6v3M7.5 10.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>Breached tento měsíc</div>
      <div class="val">${breachedThisMonth}</div>
    </div>`;

  const maxSignup = Math.max(...SIGNUP_WEEKS.map((d) => d.value));
  document.getElementById("playersGrowthChart").innerHTML = SIGNUP_WEEKS.map((d) => {
    const heightPct = Math.max(6, Math.round((d.value / maxSignup) * 100));
    return `<div class="bc-col"><span class="bar pos" style="height:${heightPct}%"></span><span class="d">${d.label}</span></div>`;
  }).join("");

  renderPlayersTable();
}

function renderPlayersTable() {
  const rows = PLAYERS.filter((p) => playersFilter === "vse" || p[6] === playersFilter);
  document.getElementById("playersTable").innerHTML = `
    <thead><tr><th>Hráč</th><th>Balíček</th><th>Fáze</th><th>Zůstatek</th><th>P/L</th><th>Win rate</th><th>Stav</th><th>Aktivita</th></tr></thead>
    <tbody>
      ${rows.map(([name, pkg, phase, balance, pl, winRate, statusKey, activity]) => {
        const status = PLAYER_STATUS[statusKey];
        return `
        <tr>
          <td>${name}</td>
          <td>${pkg}</td>
          <td>${phase}</td>
          <td class="odds">${czk(balance)}</td>
          <td class="odds" style="color:${pl >= 0 ? "var(--accent)" : "#ff9d9d"}">${pl >= 0 ? "+" : ""}${czk(pl)}</td>
          <td class="odds">${winRate} %</td>
          <td><span class="tag ${status.tag}">${status.label}</span></td>
          <td style="color:var(--text-muted)">${activity}</td>
        </tr>`;
      }).join("")}
    </tbody>`;
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest("#playersTabs button");
  if (!btn) return;
  document.querySelectorAll("#playersTabs button").forEach((b) => {
    const on = b === btn;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  playersFilter = btn.dataset.ptab;
  renderPlayersTable();
});

// ---------- Diagnostika: mock data ----------
const DIAG_SERVICES = [
  ["win", "odds-api.io feed", "Provozováno normálně"],
  ["win", "Vyhodnocovací engine", "Provozováno normálně"],
  ["pend", "Platební brána", "Zvýšená latence ~640 ms"],
  ["win", "E-mail / notifikace", "Provozováno normálně"],
];

const DIAG_ALERTS = [
  ["loss", "Kritické", "Tiket #48213 — timeout při vyhodnocení, opakuji za 5 min", "07:52", "3. pokus z 5, poslední chyba: ETIMEDOUT api.odds-api.io"],
  ["pend", "Varování", "Rate limit odds-api.io na 82 % denní kvóty", "07:40", "8 214 / 10 000 požadavků, reset o půlnoci"],
  ["pend", "Varování", "3 hráči překročili 90 % max drawdown limitu", "06:15", "Automaticky notifikováno, čeká na manuální revizi"],
  ["neutral", "Info", "Vyhodnoceno 214 tiketů za posledních 24 h, 0 chyb", "03:00", ""],
  ["neutral", "Info", "Cache TTL vypršel pro 6 živých zápasů, obnoveno automaticky", "01:12", ""],
];

const DIAG_QUEUE = [
  ["#48213", "Ján Kováč", "Slavia Praha – Sparta Praha (ML)", "6 min", "3/5"],
  ["#48209", "Lucie Nováková", "Djokovic – Alcaraz (Vítěz)", "2 min", "1/5"],
  ["#48201", "Marek Sýkora", "3× akumulátor (fotbal)", "14 min", "4/5"],
  ["#48198", "Zuzana Poláková", "Real Madrid – Barcelona (Totál)", "21 min", "2/5"],
];

function renderDiagnostika() {
  document.getElementById("diagStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 7.5l1.5 1.5 2.5-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>API dostupnost</div>
      <div class="val green">99.94 %</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" stroke-width="1.6"/><path d="M7.5 4.5v3.3l2.2 1.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>Průměrná odezva</div>
      <div class="val">184 ms</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><rect x="1.5" y="1.5" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M4.5 7.5h6M7.5 4.5v6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>Čekající vyhodnocení</div>
      <div class="val">${DIAG_QUEUE.length}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><span class="ic-chip"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.8L1.8 12.7h11.4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7.5 6v3M7.5 10.7v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>Chybovost (24 h)</div>
      <div class="val">0.6 %</div>
    </div>`;

  document.getElementById("diagServices").innerHTML = DIAG_SERVICES.map(([tag, name, meta]) =>
    `<div class="k-row ${tag}"><span class="svc-name"><span class="svc-dot"></span>${name}</span><span class="n svc-meta">${meta}</span></div>`
  ).join("");

  document.getElementById("diagAlerts").innerHTML = DIAG_ALERTS.map(([tag, level, msg, time, detail]) => `
    <div class="k-row ${tag} alert-row">
      <div class="alert-top"><span class="tag ${tag}">${level}</span><span class="alert-msg">${msg}</span><span class="alert-time">${time}</span></div>
      ${detail ? `<div class="alert-detail">${detail}</div>` : ""}
    </div>`).join("");

  document.getElementById("diagQueueTable").innerHTML = `
    <thead><tr><th>Tiket</th><th>Hráč</th><th>Událost</th><th>Čeká od</th><th>Pokusy</th></tr></thead>
    <tbody>
      ${DIAG_QUEUE.map(([id, who, event, since, attempts]) => `
        <tr>
          <td class="odds">${id}</td>
          <td>${who}</td>
          <td>${event}</td>
          <td style="color:var(--text-muted)">${since}</td>
          <td class="odds">${attempts}</td>
        </tr>`).join("")}
    </tbody>`;
}

renderFinance();
renderPlayers();
renderDiagnostika();

// ---------- reálná data ze Supabase (odemknutí admin klíčem) ----------
// Dokud není backend nastaven v js/config.js a/nebo admin odemknutý klíčem,
// zůstávají všechny pohledy na mock datech výše beze změny.

const ADMIN_KEY_STORAGE = "fundly:adminKey";
let REAL = null; // načtená data z edge funkce admin-stats

function adminBackendReady() {
  return typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled();
}

function getAdminKey() {
  try { return sessionStorage.getItem(ADMIN_KEY_STORAGE) || ""; } catch (e) { return ""; }
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function adminFetch(fnName, body) {
  const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-key": getAdminKey() },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// malý odemykací panel nad pohledy
function renderAdminGate(note) {
  const container = document.querySelector(".dash-main .container");
  if (!container || document.getElementById("adminGate")) return;
  const gate = document.createElement("div");
  gate.className = "panel";
  gate.id = "adminGate";
  gate.innerHTML = `
    <h3>Reálná data (Supabase)</h3>
    <p class="bet-msg" style="margin-bottom:12px">Zadejte admin klíč pro načtení skutečných tržeb, hráčů a výplat. Bez klíče se zobrazují ukázková data.</p>
    <div style="display:flex;gap:8px;max-width:420px">
      <input class="input" id="adminKeyInput" type="password" placeholder="Admin klíč" autocomplete="off" />
      <button class="btn btn-primary" id="adminUnlock">Odemknout</button>
    </div>
    <p class="auth-note mt" id="adminGateNote" ${note ? "" : "hidden"}>${esc(note)}</p>`;
  container.prepend(gate);
  document.getElementById("adminUnlock").addEventListener("click", unlockAdmin);
  document.getElementById("adminKeyInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") unlockAdmin();
  });
}

async function unlockAdmin() {
  const input = document.getElementById("adminKeyInput");
  const noteEl = document.getElementById("adminGateNote");
  const key = input.value.trim();
  if (!key) return;
  try { sessionStorage.setItem(ADMIN_KEY_STORAGE, key); } catch (e) {}
  try {
    await loadRealStats();
  } catch (err) {
    try { sessionStorage.removeItem(ADMIN_KEY_STORAGE); } catch (e) {}
    noteEl.textContent = err.message || "Data se nepodařilo načíst.";
    noteEl.hidden = false;
  }
}

async function loadRealStats() {
  const stats = await adminFetch("admin-stats");
  REAL = stats;
  const gate = document.getElementById("adminGate");
  if (gate) gate.hidden = true;
  renderRealFinance(stats);
  renderRealPlayers(stats);
  renderPlayersTable(); // přepnutá verze níže vykreslí reálné účty
  renderAffiliate();
}

// ---------- Finance: reálná data ----------
function renderRealFinance(stats) {
  const dstat = (label, value, green) => `
    <div class="dstat">
      <div class="lbl">${label}</div>
      <div class="val ${green ? "green" : ""}">${value}</div>
    </div>`;

  document.getElementById("finStatGrid").innerHTML =
    dstat("Tržby tento měsíc", czk(stats.monthRevenue), true) +
    dstat("Tržby celkem", czk(stats.totalRevenue), false) +
    dstat("Úspěšné platby tento měsíc", stats.monthCount, false) +
    dstat("Meta ads tento měsíc", czk(stats.metaAdsSpendCzk), false);

  // panel „Rozpad tržeb“ přepneme na poslední platby
  const breakdown = document.getElementById("finBreakdown");
  breakdown.closest(".panel").querySelector("h3").textContent = "Poslední platby";
  breakdown.innerHTML = stats.recentPayments.length
    ? stats.recentPayments.map((p) => {
        const tag = p.status === "succeeded" ? "win" : p.status === "failed" ? "loss" : "pend";
        const label = p.status === "succeeded" ? "zaplaceno" : p.status === "failed" ? "selhalo" : esc(p.status);
        const amt = p.currency === "eur"
          ? `${(Number(p.amount) || 0).toLocaleString("cs-CZ")} EUR`
          : czk(Number(p.amount) || 0);
        return `<div class="k-row neutral">${esc(p.email || "—")} · ${esc(p.package_key || "?")}<span class="n"><span class="tag ${tag}">${label}</span> ${amt}</span></div>`;
      }).join("")
    : `<p class="bet-msg">Zatím žádné platby.</p>`;

  document.getElementById("finPayouts").innerHTML = stats.recentPayouts.length
    ? stats.recentPayouts.map((p) => {
        const paid = p.status === "sent" || p.status === "paid";
        const tag = paid ? "win" : p.status === "failed" || p.status === "rejected" ? "loss" : "pend";
        const label = paid ? "vyplaceno" : p.status === "failed" ? "selhalo" : p.status === "rejected" ? "zamítnuto" : "čeká na schválení";
        // čekající žádost hráče → akce „Schválit a vyplatit“ / „Zamítnout“
        const approveBtn = p.status === "pending"
          ? ` <button class="btn btn-ghost" data-approve-payout="${esc(p.id)}" data-account="${esc(p.account_id)}" data-amount="${esc(p.amount)}">Schválit a vyplatit</button>` +
            ` <button class="btn btn-ghost" data-reject-payout="${esc(p.id)}" data-account="${esc(p.account_id)}">Zamítnout</button>`
          : "";
        const who = p.email
          ? `${esc(p.email)} · ${esc(p.package_key || "?")} (kapitál ${czk(Number(p.capital) || 0)}) · utratil ${czk(Number(p.totalSpentCzk) || 0)}`
          : `Výplata #${esc(String(p.id).slice(0, 8))}`;
        const when = new Date(p.created_at).toLocaleString("cs-CZ");
        return `<div class="k-row neutral"><span>${who}<br><span style="color:var(--text-muted);font-size:.8125rem">${p.method ? `${esc(p.method)} · ` : ""}${when}</span></span><span class="n"><span class="tag ${tag}">${label}</span> ${czk(Number(p.amount) || 0)}${approveBtn}</span></div>`;
      }).join("")
    : `<p class="bet-msg">Zatím žádné výplaty.</p>`;

  // reálný Meta spend jako nový řádek v tabulce marketingových kanálů
  const table = document.getElementById("finChannelsTable");
  const tbody = table.querySelector("tbody");
  if (tbody) {
    tbody.insertAdjacentHTML("beforeend", `
      <tr>
        <td>Meta Ads (reálný spend)</td>
        <td class="odds"><b>${czk(stats.metaAdsSpendCzk)}</b></td>
        <td class="odds">—</td>
        <td class="odds">—</td>
        <td class="odds">—</td>
      </tr>`);
  }
}

// ---------- Hráči: reálné účty ----------
const REAL_STATUS = {
  active: { tag: "push", label: "Aktivní", filter: "aktivni" },
  funded: { tag: "win", label: "Financovaný", filter: "funded" },
  breached: { tag: "loss", label: "Breached", filter: "breached" },
};
const realStatus = (state) =>
  REAL_STATUS[state] || { tag: "loss", label: esc(state || "neaktivní"), filter: "breached" };

function renderRealPlayers(stats) {
  const counts = stats.accountsByState || {};
  const total = Object.values(counts).reduce((a, v) => a + v, 0);
  const dstat = (label, value, green) => `
    <div class="dstat">
      <div class="lbl">${label}</div>
      <div class="val ${green ? "green" : ""}">${value}</div>
    </div>`;
  document.getElementById("playersStatGrid").innerHTML =
    dstat("Účty celkem", total.toLocaleString("cs-CZ"), false) +
    dstat("Aktivní", (counts.active || 0).toLocaleString("cs-CZ"), false) +
    dstat("Financovaní", (counts.funded || 0).toLocaleString("cs-CZ"), true) +
    dstat("Ostatní stavy", (total - (counts.active || 0) - (counts.funded || 0)).toLocaleString("cs-CZ"), false);
}

// přepneme render tabulky hráčů na reálná data (mock verze zůstává jako fallback)
const renderPlayersTableMock = renderPlayersTable;
renderPlayersTable = function () {
  if (!REAL) return renderPlayersTableMock();
  const rows = (REAL.recentAccounts || []).filter(
    (a) => playersFilter === "vse" || realStatus(a.state).filter === playersFilter
  );
  document.getElementById("playersTable").innerHTML = `
    <thead><tr><th>E-mail</th><th>Balíček</th><th>Fáze</th><th>Kapitál</th><th>Stav</th><th>Vytvořeno</th><th></th></tr></thead>
    <tbody>
      ${rows.length ? rows.map((a) => {
        const status = realStatus(a.state);
        return `
        <tr class="row-player" data-acc="${esc(a.id)}" title="Otevřít detail hráče">
          <td>${esc(a.email)}</td>
          <td>${esc(a.package_key)}</td>
          <td>Fáze ${esc(a.phase)}</td>
          <td class="odds">${czk(Number(a.capital) || 0)}</td>
          <td><span class="tag ${status.tag}">${status.label}</span></td>
          <td style="color:var(--text-muted)">${new Date(a.created_at).toLocaleDateString("cs-CZ")}</td>
          <td>${a.state === "funded"
            ? `<button class="btn btn-ghost" data-payout="${esc(a.id)}" data-email="${esc(a.email)}">Vyplatit</button>`
            : ""}</td>
        </tr>`;
      }).join("") : `<tr><td colspan="7">Žádné účty pro zvolený filtr.</td></tr>`}
    </tbody>`;
};

// ---------- detail hráče (klik na řádek tabulky) ----------
const playerModal = document.getElementById("playerModal");
const pmBody = document.getElementById("pmBody");

function closePlayerDetail() {
  if (playerModal) playerModal.hidden = true;
}

function openPlayerDetail(acc) {
  if (!playerModal || !REAL) return;
  const fmtDate = (d) => new Date(d).toLocaleString("cs-CZ");
  const fmtAmount = (p) => p.currency === "eur"
    ? `${(Number(p.amount) || 0).toLocaleString("cs-CZ")} EUR`
    : czk(Number(p.amount) || 0);

  // všechny účty uživatele (hráč jich může mít několik) + jeho platby a payouty
  const accounts = (REAL.recentAccounts || []).filter((a) => a.email === acc.email);
  const accountIds = accounts.map((a) => String(a.id));
  const payments = (REAL.recentPayments || []).filter((p) => p.email === acc.email);
  const payouts = (REAL.recentPayouts || []).filter((p) => accountIds.includes(String(p.account_id)));

  // pole totalSpentCzk doplní edge funkce admin-stats (suma succeeded plateb v CZK, per e-mail)
  const spent = acc.totalSpentCzk != null ? czk(Number(acc.totalSpentCzk) || 0) : "—";

  const infoRow = (k, v) => `<div class="pm-row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
  const kycRow = (a) => {
    const kyc = a.kyc_status ?? "unknown";
    const tag = kyc === "verified" ? "win" : kyc === "failed" ? "loss" : "pend";
    const label = kyc === "verified" ? "Ověřeno" : kyc === "failed" ? "Zamítnuto" : "Neověřeno";
    return infoRow("KYC (Whop)", `<span class="tag ${tag}">${label}</span>`);
  };
  const flagTag = (f) =>
    `<span class="tag flag">${f === "arbitrage" ? "⚠ arbitrage" : f === "value" ? "⚠ value bet" : "⚠ " + esc(f)}</span>`;

  // jeden blok = jeden challenge účet vč. synchronizovaných pravidel
  const accBlock = (a) => {
    const status = realStatus(a.state);
    const synced = Boolean(a.synced_at);
    const flags = Array.isArray(a.flags) ? a.flags : [];
    const total = Number(a.tickets_total) || 0;
    const won = Number(a.tickets_won) || 0;
    const winrate = total ? Math.round((won / total) * 100) : 0;
    const profit = Number(a.profit) || 0;
    return `
    <div class="pm-acc">
      <div class="pm-acc-head">
        <span class="t">${esc(a.package_key || "?")} · ${czk(Number(a.capital) || 0)}</span>
        <span class="tag ${status.tag}">${status.label}</span>
      </div>
      <div class="pm-grid">
        ${infoRow("Fáze", `Fáze ${esc(a.phase ?? "—")}`)}
        ${kycRow(a)}
        ${infoRow("Vytvořeno", a.created_at ? fmtDate(a.created_at) : "—")}
      </div>
      ${a.state === "breached" && a.breach_reason
        ? `<div class="k-row loss" style="margin-top:10px">Porušení pravidel<span class="n">${esc(a.breach_reason)}</span></div>`
        : ""}
      ${synced ? `
        <div class="pm-grid" style="margin-top:10px">
          ${infoRow("Zůstatek", czk(Number(a.phase_balance) || 0))}
          ${infoRow("Profit", `<span style="color:${profit >= 0 ? "var(--accent)" : "#ff9d9d"}">${profit >= 0 ? "+" : ""}${czk(profit)}</span>`)}
          ${infoRow("Kvalif. tikety", `${Number(a.qualifying_tickets) || 0} / 5`)}
          ${infoRow("Tikety (výherní)", `${total} (${won}) · ${winrate} %`)}
        </div>
        ${flags.length ? `
          <h4 class="pm-h">Zakázané strategie</h4>
          <div class="pm-flags">${flags.map(flagTag).join(" ")}</div>` : ""}
        <p class="pm-date" style="margin-top:8px">Poslední synchronizace: ${fmtDate(a.synced_at)}</p>`
      : `<p class="pm-date" style="margin-top:10px">Zatím nesynchronizováno — statistiky pravidel se zobrazí po první synchronizaci z dashboardu hráče.</p>`}
      ${a.state === "funded"
        ? `<button class="btn btn-primary" style="width:100%;margin-top:12px" data-payout="${esc(a.id)}" data-email="${esc(a.email)}">Vyplatit</button>`
        : ""}
    </div>`;
  };

  pmBody.innerHTML = `
    <h3 class="pm-title" id="pmTitle">${esc(acc.email || "Hráč")}</h3>
    <div class="pm-grid">
      ${infoRow("Účty", String(accounts.length))}
      ${infoRow("Utratil celkem", spent)}
    </div>
    <p class="pm-date" style="margin-top:8px">Ověření identity probíhá přes Whop KYC — hráče nasměrujte na verification session z Whop dashboardu, stav se sem synchronizuje webhookem.</p>

    ${accounts.map(accBlock).join("")}

    <h4 class="pm-h">Platby</h4>
    <div class="k-rows">
      ${payments.length ? payments.map((p) => {
        const tag = p.status === "succeeded" ? "win" : p.status === "failed" ? "loss" : "pend";
        const label = p.status === "succeeded" ? "zaplaceno" : p.status === "failed" ? "selhalo" : esc(p.status);
        return `<div class="k-row neutral">${fmtAmount(p)} · ${esc(p.package_key || "?")}<span class="n"><span class="tag ${tag}">${label}</span> <span class="pm-date">${fmtDate(p.created_at)}</span></span></div>`;
      }).join("") : `<p class="bet-msg" style="padding:16px">Žádné platby.</p>`}
    </div>

    <h4 class="pm-h">Žádosti o výplatu</h4>
    <div class="k-rows">
      ${payouts.length ? payouts.map((p) => {
        const paid = p.status === "sent" || p.status === "paid";
        const tag = paid ? "win" : p.status === "failed" || p.status === "rejected" ? "loss" : "pend";
        const label = paid ? "vyplaceno" : p.status === "failed" ? "selhalo" : p.status === "rejected" ? "zamítnuto" : "čeká na schválení";
        return `<div class="k-row neutral">${czk(Number(p.amount) || 0)}${p.method ? ` · ${esc(p.method)}` : ""}<span class="n"><span class="tag ${tag}">${label}</span> <span class="pm-date">${fmtDate(p.created_at)}</span></span></div>`;
      }).join("") : `<p class="bet-msg" style="padding:16px">Žádné žádosti o výplatu.</p>`}
    </div>`;
  playerModal.hidden = false;
}

// klik na řádek otevře detail (tlačítko „Vyplatit“ v řádku detail neotevírá)
document.addEventListener("click", (e) => {
  const row = e.target.closest("#playersTable tr[data-acc]");
  if (!row || e.target.closest("[data-payout]")) return;
  const acc = REAL && (REAL.recentAccounts || []).find((x) => String(x.id) === row.dataset.acc);
  if (acc) openPlayerDetail(acc);
});

// zavření: křížek, klik na backdrop, Esc
if (playerModal) {
  document.getElementById("pmClose").addEventListener("click", closePlayerDetail);
  playerModal.addEventListener("click", (e) => {
    if (e.target === playerModal) closePlayerDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !playerModal.hidden) closePlayerDetail();
  });
}

// ---------- výplaty: tlačítko „Vyplatit“ u financovaného hráče ----------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-payout]");
  if (!btn) return;
  const amount = window.prompt(`Částka k vyplacení pro ${btn.dataset.email} (Kč):`);
  if (amount === null) return;
  const value = Number(String(amount).replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) {
    window.alert("Zadejte platnou částku.");
    return;
  }
  if (!window.confirm(`Opravdu vyplatit ${czk(value)} hráči ${btn.dataset.email}?`)) return;
  btn.disabled = true;
  try {
    const result = await adminFetch("whop-payout", { accountId: btn.dataset.payout, amount: value });
    window.alert(`Výplata odeslána (transfer ${result.transferId || "—"}).`);
    await loadRealStats();
  } catch (err) {
    window.alert(err.message || "Výplata se nepodařila.");
    btn.disabled = false;
  }
});

// ---------- výplaty: schválení čekající žádosti z „Poslední výplaty“ ----------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-approve-payout]");
  if (!btn) return;
  const amount = Number(btn.dataset.amount);
  if (!window.confirm(`Opravdu schválit a vyplatit ${czk(amount)} (žádost #${String(btn.dataset.approvePayout).slice(0, 8)})?`)) return;
  btn.disabled = true;
  try {
    const result = await adminFetch("whop-payout", {
      accountId: btn.dataset.account,
      amount,
      payoutId: btn.dataset.approvePayout,
    });
    window.alert(`Výplata odeslána (transfer ${result.transferId || "—"}).`);
    await loadRealStats();
  } catch (err) {
    window.alert(err.message || "Výplata se nepodařila.");
    btn.disabled = false;
  }
});

// ---------- výplaty: zamítnutí čekající žádosti ----------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-reject-payout]");
  if (!btn) return;
  if (!window.confirm(`Opravdu zamítnout žádost #${String(btn.dataset.rejectPayout).slice(0, 8)}? Peníze se nikam nepřesunou.`)) return;
  btn.disabled = true;
  try {
    await adminFetch("whop-payout", {
      accountId: btn.dataset.account,
      amount: 0,
      payoutId: btn.dataset.rejectPayout,
      action: "reject",
    });
    await loadRealStats();
  } catch (err) {
    window.alert(err.message || "Zamítnutí se nepodařilo.");
    btn.disabled = false;
  }
});

// ---------- Affiliate: kódy + konverze (jen reálná data, mock nemá) ----------
const AFF_PLAN_LABELS = {
  all: "Všechny balíčky",
  starter: "Starter",
  standard: "Standard",
  advanced: "Advanced",
  pro: "Pro",
  elite: "Elite",
};

function affNoteShow(msg) {
  const note = document.getElementById("affNote");
  if (!note) return;
  note.textContent = msg;
  note.hidden = false;
}

function renderAffiliate() {
  const table = document.getElementById("affCodesTable");
  const conv = document.getElementById("affConversions");
  if (!table || !conv) return;

  const codes = (REAL && REAL.affiliateCodes) || [];
  table.innerHTML = `
    <thead><tr><th>Kód</th><th>Balíček</th><th>Sleva</th><th>Provize</th><th>Limit</th><th>Použito</th><th>Vlastník</th><th>Stav</th><th></th></tr></thead>
    <tbody>
      ${codes.length ? codes.map((c) => `
        <tr>
          <td class="odds"><b>${esc(c.code)}</b></td>
          <td>${esc(AFF_PLAN_LABELS[c.plan_key] || c.plan_key)}</td>
          <td class="odds">${Number(c.discount_pct)} %</td>
          <td class="odds">${Number(c.commission_pct)} %</td>
          <td class="odds">${c.usage_limit ?? "∞"}</td>
          <td class="odds">${Number(c.used) || 0}</td>
          <td style="color:var(--text-muted)">${esc(c.owner_email)}</td>
          <td><span class="tag ${c.active ? "win" : "loss"}">${c.active ? "aktivní" : "archivován"}</span></td>
          <td>${c.active ? `<button class="btn btn-ghost" data-aff-archive="${esc(c.id)}" data-code="${esc(c.code)}">Archivovat</button>` : ""}</td>
        </tr>`).join("")
      : `<tr><td colspan="9">${REAL ? "Zatím žádné affiliate kódy." : "Odemkněte admin klíčem pro načtení kódů."}</td></tr>`}
    </tbody>`;

  const conversions = (REAL && REAL.promoConversions) || [];
  conv.innerHTML = conversions.length
    ? conversions.map((p) => {
        const amt = p.currency === "eur"
          ? `${(Number(p.amount) || 0).toLocaleString("cs-CZ")} EUR`
          : `$${(Number(p.amount) || 0).toLocaleString("en-US")}`;
        const when = new Date(p.created_at).toLocaleString("cs-CZ");
        return `<div class="k-row neutral">${esc(p.email || "—")} · ${esc(p.package_key || "?")} · kód <b>${esc(p.promo_code)}</b><span class="n">${amt} <span class="pm-date">${when}</span></span></div>`;
      }).join("")
    : `<p class="bet-msg">${REAL ? "Zatím žádné konverze přes promo kód." : "Odemkněte admin klíčem pro načtení konverzí."}</p>`;
}

// vytvoření kódu: edge funkce affiliate-manage založí promo kód ve Whop + záznam u nás
const affForm = document.getElementById("affForm");
if (affForm) {
  affForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("affSubmit");
    btn.disabled = true;
    try {
      await adminFetch("affiliate-manage", {
        action: "create",
        code: document.getElementById("affCode").value,
        planKey: document.getElementById("affPlan").value,
        discountPct: document.getElementById("affDiscount").value,
        commissionPct: document.getElementById("affCommission").value,
        usageLimit: document.getElementById("affLimit").value,
        ownerEmail: document.getElementById("affOwner").value,
      });
      affNoteShow("Kód vytvořen ve Whop i u nás.");
      affForm.reset();
      await loadRealStats();
    } catch (err) {
      affNoteShow(err.message || "Kód se nepodařilo vytvořit.");
    } finally {
      btn.disabled = false;
    }
  });
}

// archivace kódu (Whop DELETE /promo_codes/{id} + vypnutí active u nás)
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-aff-archive]");
  if (!btn) return;
  if (!window.confirm(`Opravdu archivovat kód ${btn.dataset.code}? Zákazníci ho už nepoužijí.`)) return;
  btn.disabled = true;
  try {
    await adminFetch("affiliate-manage", { action: "archive", id: btn.dataset.affArchive });
    await loadRealStats();
  } catch (err) {
    window.alert(err.message || "Archivace se nepodařila.");
    btn.disabled = false;
  }
});

renderAffiliate(); // prázdný stav do odemknutí admin klíčem

// ---------- init: odemknutí reálných dat ----------
if (adminBackendReady()) {
  if (getAdminKey()) {
    // klíč ze sessionStorage — zkusíme rovnou načíst, při chybě zpět na bránu
    loadRealStats().catch((err) => {
      try { sessionStorage.removeItem(ADMIN_KEY_STORAGE); } catch (e) {}
      renderAdminGate(err.message);
    });
  } else {
    renderAdminGate();
  }
}
