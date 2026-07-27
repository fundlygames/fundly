/* Betflow — Concept 3/5 "Cinematic Vault"
   Reads the REAL shared Portfolio/packages state (js/packages.js + js/portfolio.js,
   loaded before this file) and renders it into the vault-themed markup below.
   No fake numbers: every figure on this page comes from Portfolio.ensure()/summary()/
   dailyNet()/drawdownInfo()/phaseTarget()/daysRemaining(). */

const czk = (n) => Math.round(n).toLocaleString("cs-CZ") + " Kč";
const num = (n) => Math.round(n).toLocaleString("cs-CZ");

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}
function fmtDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

const STATUS_WORD = { pending: "Čeká", won: "Vyhráno", lost: "Prohráno", push: "Vráceno" };

function selectionLabel(sel) {
  return `${sel.homeTeam} – ${sel.awayTeam} (${sel.pickLabel})`;
}
function ticketLabel(t) {
  return t.selections.length > 1
    ? `${t.selections.length}× akumulátor · ${selectionLabel(t.selections[0])}`
    : selectionLabel(t.selections[0]);
}

// ---------- view switching ----------
const VIEWS = ["prehled", "vykon"];
function showView(name) {
  VIEWS.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.hidden = v !== name;
  });
  document.querySelectorAll("[data-view]").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" });
  if (name === "prehled") renderPrehled();
  if (name === "vykon") renderVykon();
}
document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-view]");
  if (nav) { showView(nav.dataset.view); return; }
  const link = e.target.closest("[data-view-link]");
  if (link) { e.preventDefault(); showView(link.dataset.viewLink); }
});

// ---------- 1+2. Hero balance + Ledger Line equity chart ----------
function renderLedgerChart(state) {
  const svg = document.getElementById("ledgerSvg");
  const hwmLine = document.getElementById("hwmLine");
  const points = state.equityHistory;

  if (!points || points.length < 2) {
    svg.innerHTML = "";
    hwmLine.style.display = "none";
    document.getElementById("tickStart").textContent = czk(state.balance);
    document.getElementById("tickCurrent").textContent = czk(state.balance);
    return;
  }

  const w = 1000, h = 320, padY = 26;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values), max = Math.max(...values);
  const span = (max - min) || Math.max(1, min * 0.05);
  const paddedMin = min - span * 0.1;
  const paddedMax = max + span * 0.1;
  const span2 = (paddedMax - paddedMin) || 1;

  const yFor = (v) => padY + (h - padY * 2) * (1 - (v - paddedMin) / span2);
  const xFor = (i) => (points.length === 1 ? 0 : (i / (points.length - 1)) * w);

  const coords = points.map((p, i) => [xFor(i), yFor(p.balance)]);
  const linePath = "M " + coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ");
  const xLast = coords[coords.length - 1][0];
  const areaPath = `${linePath} L ${xLast.toFixed(1)},${h} L 0,${h} Z`;

  const baselineY = yFor(points[0].balance);
  const baselineFrac = Math.max(0, Math.min(1, baselineY / h));

  svg.innerHTML = `
    <defs>
      <linearGradient id="equityAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#29c98f" stop-opacity="0.26" />
        <stop offset="${baselineFrac.toFixed(4)}" stop-color="#29c98f" stop-opacity="0.03" />
        <stop offset="${baselineFrac.toFixed(4)}" stop-color="#a8433a" stop-opacity="0.03" />
        <stop offset="1" stop-color="#a8433a" stop-opacity="0.28" />
      </linearGradient>
      <clipPath id="equityAreaClip"><path d="${areaPath}" /></clipPath>
    </defs>
    <rect x="0" y="0" width="${w}" height="${h}" fill="url(#equityAreaGrad)" clip-path="url(#equityAreaClip)" />
    <path d="${linePath}" fill="none" stroke="#d4af6a" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  `;

  const yHWM = yFor(state.hwm);
  hwmLine.style.display = "";
  hwmLine.style.top = `${Math.max(0, Math.min(100, (yHWM / h) * 100)).toFixed(2)}%`;

  document.getElementById("tickStart").textContent = czk(points[0].balance);
  document.getElementById("tickCurrent").textContent = czk(points[points.length - 1].balance);
}

// ---------- 4. Vault Entries (recent tickets) ----------
function renderEntries(state) {
  const el = document.getElementById("entriesList");
  const recent = [...state.tickets]
    .sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt))
    .slice(0, 5);

  if (!recent.length) {
    el.innerHTML = `<p class="entries-empty">Zatím žádné tikety. Vsaďte první v sekci Sázení.</p>`;
    return;
  }

  el.innerHTML = recent.map((t) => `
    <div class="entry-row">
      <span class="entry-dot ${t.status}"></span>
      <span class="entry-label">${ticketLabel(t)}</span>
      <span class="entry-odds">@${t.combinedOdds.toFixed(2)}</span>
      <span class="entry-stake">${czk(t.stake)}</span>
      <span class="entry-status ${t.status}">${STATUS_WORD[t.status]}</span>
    </div>
  `).join("");
}

// ---------- Přehled ----------
function renderPrehled() {
  const view = document.getElementById("view-prehled");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  const funded = state.phase === "funded";
  const phaseLabel = funded ? "FINANCOVANÝ ÚČET" : `FÁZE ${state.phase}`;

  document.getElementById("heroEyebrow").textContent = `KAPITÁL PORTFOLIA · ${phaseLabel}`;
  document.getElementById("heroBalance").textContent = num(state.balance);
  document.getElementById("sealName").textContent = state.packageName.toUpperCase();
  document.getElementById("sealCap").textContent = num(state.cap);

  const railWrap = document.getElementById("heroRailWrap");
  if (funded) {
    railWrap.style.display = "none";
    document.getElementById("heroMeta").textContent =
      `Financovaný účet · ${state.profitSplit} % podíl na zisku · žádný časový limit`;
  } else {
    railWrap.style.display = "";
    const target = Portfolio.phaseTarget(state);
    const profit = state.balance - state.phaseBaseline;
    const pct = target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 100;
    const daysLeft = Portfolio.daysRemaining(state);

    document.getElementById("railFill").style.width = `${pct}%`;
    document.getElementById("railMarker").style.left = `${pct}%`;
    document.getElementById("railFromLabel").textContent = `Start ${czk(state.phaseBaseline)}`;
    document.getElementById("railTargetLabel").textContent = `Cíl ${czk(state.phaseBaseline + target)}`;
    document.getElementById("heroMeta").textContent =
      `${Math.round(pct)} % k cíli +${czk(target)} · ${daysLeft} dní zbývá`;
  }

  renderLedgerChart(state);

  const dd = Portfolio.drawdownInfo(state);
  document.getElementById("floorPosition").style.top = `${(100 - dd.pct).toFixed(1)}%`;
  document.getElementById("floorRemaining").textContent = czk(dd.remaining);

  if (funded) {
    document.getElementById("daysRemaining").textContent = "∞";
    document.getElementById("daysCaption").textContent = "financovaný účet, žádný časový limit";
  } else {
    document.getElementById("daysRemaining").textContent = Portfolio.daysRemaining(state);
    document.getElementById("daysCaption").textContent = "dní zbývá do konce fáze";
  }

  renderEntries(state);
}

// ---------- Výkon ----------
function renderVykon() {
  const view = document.getElementById("view-vykon");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  const s = Portfolio.summary(state);

  document.getElementById("reportRange").textContent =
    `${state.packageName} · ${fmtDate(state.phaseStartedAt)} — ${fmtDate(new Date())}`;
  document.getElementById("winRateVal").textContent = `${s.winRate} %`;

  const ratioBar = document.getElementById("ratioBar");
  if (s.total === 0) {
    ratioBar.innerHTML = `<span class="ratio-seg pending" style="flex:1 1 100%"></span>`;
  } else {
    ratioBar.innerHTML = `
      <span class="ratio-seg won" style="flex:${s.won} 1 0"></span>
      <span class="ratio-seg lost" style="flex:${s.lost} 1 0"></span>
      <span class="ratio-seg pending" style="flex:${s.pending} 1 0"></span>
    `;
  }
  document.getElementById("legendWon").textContent = s.won;
  document.getElementById("legendLost").textContent = s.lost;
  document.getElementById("legendPending").textContent = s.pending;

  const netEl = document.getElementById("netProfitVal");
  netEl.textContent = `${s.netProfit >= 0 ? "+" : ""}${czk(s.netProfit)}`;
  netEl.className = `hero-stat-val ${s.netProfit >= 0 ? "pos" : "neg"}`;
  document.getElementById("netProfitCaption").textContent =
    `Z ${s.total} tiketů · ${s.won} výher, ${s.lost} proher, ${s.pending} čeká`;

  document.getElementById("avgOddsVal").textContent = s.total ? s.avgOdds.toFixed(2) : "–";
  document.getElementById("totalStakedVal").textContent = czk(s.staked);
  document.getElementById("totalReturnedVal").textContent = czk(s.returned);

  renderIngotStrip(state);
  renderLedgerTable(state);
}

function renderIngotStrip(state) {
  const el = document.getElementById("ingotStrip");
  const days = Portfolio.dailyNet(state, 7);
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));

  el.innerHTML = days.map((d) => {
    const cls = d.net > 0 ? "pos" : d.net < 0 ? "neg" : "zero";
    const height = d.net === 0 ? 4 : Math.max(6, Math.round((Math.abs(d.net) / maxAbs) * 120));
    const sign = d.net > 0 ? "+" : d.net < 0 ? "−" : "";
    const amount = czk(Math.abs(d.net));
    return `
      <div class="ingot">
        <div class="ingot-tooltip">${sign}${amount}</div>
        <div class="ingot-bar ${cls}" style="height:${height}px"></div>
        <div class="ingot-day">${d.label}</div>
      </div>`;
  }).join("");
}

function renderLedgerTable(state) {
  const el = document.getElementById("ledgerTableBody");
  const tickets = [...state.tickets].sort((a, b) => new Date(b.placedAt) - new Date(a.placedAt));

  if (!tickets.length) {
    el.innerHTML = `<tr><td colspan="6" class="ledger-empty">Zatím žádné tikety. Vsaďte první v sekci Sázení.</td></tr>`;
    return;
  }

  el.innerHTML = tickets.map((t) => {
    const matchText = t.selections.length > 1
      ? `${t.selections.length}× akumulátor: ${t.selections.map(selectionLabel).join(" + ")}`
      : selectionLabel(t.selections[0]);
    return `
      <tr>
        <td class="mono">${fmtDateShort(t.placedAt)}</td>
        <td class="match" title="${matchText.replace(/"/g, "&quot;")}">${matchText}</td>
        <td class="num mono">${t.combinedOdds.toFixed(2)}</td>
        <td class="num mono">${czk(t.stake)}</td>
        <td class="num mono">${t.payout != null ? czk(t.payout) : "–"}</td>
        <td><span class="ledger-status ${t.status}"><span class="dot"></span>${STATUS_WORD[t.status]}</span></td>
      </tr>`;
  }).join("");
}

// ---------- bootstrap ----------
Portfolio.ensure("advanced");
async function refreshAfterSettlement() {
  await Portfolio.checkSettlements();
  renderPrehled();
  renderVykon();
}
refreshAfterSettlement();
setInterval(refreshAfterSettlement, 5 * 60 * 1000);
