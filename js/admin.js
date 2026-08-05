/* Fundly admin — finance, hráči, diagnostika (interní, mock data) */

const czk = (n) => n.toLocaleString("cs-CZ") + " Kč";

// ---------- přepínání sekcí ----------
const views = ["finance", "hraci", "diagnostika"];

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
