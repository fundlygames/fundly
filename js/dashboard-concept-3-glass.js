/* Fundly — Concept 3: "Glass Command Center"
   Reads the real shared Portfolio/packages APIs (js/packages.js,
   js/portfolio.js) and renders live bf1:portfolio state into the
   HUD/glass dashboard markup. This file only ever READS state via
   Portfolio.ensure()/Portfolio.get() — it never clears or resets
   the stored portfolio. */

(function () {
  "use strict";

  let currentLogFilter = "all";

  /* ---------- formatting helpers ---------- */

  function fmtKc(n) {
    return Math.round(n || 0).toLocaleString("cs-CZ") + " Kč";
  }

  function fmtSigned(n) {
    const v = Math.round(n || 0);
    const sign = v >= 0 ? "+" : "−";
    return sign + Math.abs(v).toLocaleString("cs-CZ") + " Kč";
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------- SVG arc helpers (0deg = top, clockwise) ---------- */

  function polarToCartesian(cx, cy, r, angleDeg) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx, cy, r, startAngle, endAngle) {
    if (endAngle - startAngle <= 0.5) return "";
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return ["M", start.x.toFixed(2), start.y.toFixed(2), "A", r, r, 0, largeArcFlag, 0, end.x.toFixed(2), end.y.toFixed(2)].join(" ");
  }

  /* ---------- HUD bar ---------- */

  function renderHud(state) {
    const planEl = document.getElementById("hudPlanName");
    if (planEl) planEl.textContent = `${state.packageName.toUpperCase()} // ${fmtKc(state.cap)}`;

    const phaseEl = document.getElementById("hudPhasePill");
    if (phaseEl) {
      if (state.phase === "funded") {
        phaseEl.textContent = "FUNDED";
        phaseEl.classList.add("is-funded");
      } else {
        phaseEl.textContent = `PHASE 0${state.phase} / 02`;
        phaseEl.classList.remove("is-funded");
      }
    }
  }

  function startClock() {
    const el = document.getElementById("hudClock");
    if (!el) return;
    function tick() {
      el.textContent = new Date().toLocaleTimeString("cs-CZ", { hour12: false });
    }
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- hero command panel ---------- */

  function renderHero(state) {
    const balanceEl = document.getElementById("heroBalance");
    balanceEl.textContent = fmtKc(state.balance);
    balanceEl.classList.toggle("is-negative", state.balance < state.cap);

    const delta = state.balance - state.cap;
    const deltaEl = document.getElementById("heroDelta");
    deltaEl.textContent = `${fmtSigned(delta)} od startu`;
    deltaEl.classList.toggle("is-positive", delta >= 0);
    deltaEl.classList.toggle("is-negative", delta < 0);

    document.getElementById("heroHwm").textContent = `HWM // ${fmtKc(state.hwm)}`;
    document.getElementById("heroCap").textContent = `KAPITÁL // ${fmtKc(state.cap)}`;

    // phase progress ring
    const target = Portfolio.phaseTarget(state);
    const profit = state.balance - state.phaseBaseline;
    const pct = state.phase === "funded" ? 100 : target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0;
    const r = 84;
    const circumference = 2 * Math.PI * r;
    const ringFill = document.getElementById("phaseRingFill");
    ringFill.style.strokeDasharray = `${circumference}`;
    ringFill.style.strokeDashoffset = `${circumference - (pct / 100) * circumference}`;
    document.getElementById("phaseRingPct").textContent = `${Math.round(pct)}%`;
    document.getElementById("phaseRingLabel").textContent = state.phase === "funded" ? "FUNDED" : `PHASE ${state.phase}`;
    document.getElementById("ringTarget1").textContent = `T1 // ${fmtKc(state.target1)}`;
    document.getElementById("ringTarget2").textContent = `T2 // ${fmtKc(state.target2)}`;

    // drawdown arc gauge
    const dd = Portfolio.drawdownInfo(state);
    const cx = 70, cy = 85, radius = 55, startAngle = 225, sweep = 270;
    document.getElementById("ddTrack").setAttribute("d", describeArc(cx, cy, radius, startAngle, startAngle + sweep));
    const fillSweep = (dd.pct / 100) * sweep;
    const ddFillEl = document.getElementById("ddFill");
    ddFillEl.setAttribute("d", describeArc(cx, cy, radius, startAngle, startAngle + fillSweep));
    ddFillEl.classList.remove("is-amber", "is-red");
    if (dd.pct < 15) ddFillEl.classList.add("is-red");
    else if (dd.pct < 30) ddFillEl.classList.add("is-amber");
    document.getElementById("ddHwm").textContent = fmtKc(dd.hwm);
    document.getElementById("ddFloor").textContent = fmtKc(dd.floor);
    document.getElementById("ddRemaining").textContent = fmtKc(dd.remaining);

    return dd;
  }

  /* ---------- risk radar (de-emphasized vertical gauge) ---------- */

  function renderRadar(state, dd) {
    const fillEl = document.getElementById("radarFill");
    fillEl.style.height = `${Math.max(2, dd.pct)}%`;
    fillEl.classList.remove("is-amber", "is-red");
    if (dd.pct < 15) fillEl.classList.add("is-red");
    else if (dd.pct < 30) fillEl.classList.add("is-amber");

    document.getElementById("radarPct").textContent = `${Math.round(dd.pct)}%`;
    const curMarker = document.getElementById("radarCurrentMarker");
    curMarker.style.top = `${100 - dd.pct}%`;
    document.getElementById("radarCurrentLabel").textContent = fmtKc(state.balance);
  }

  /* ---------- equity curve ---------- */

  function renderEquityChart(state) {
    const svg = document.getElementById("equitySvg");
    const hist = state.equityHistory && state.equityHistory.length
      ? state.equityHistory
      : [{ t: state.phaseStartedAt, balance: state.balance }];

    const W = 600, H = 220, padY = 16, padX = 4;
    const balances = hist.map((p) => p.balance);
    let min = Math.min(...balances);
    let max = Math.max(...balances);
    if (min === max) { min -= 1; max += 1; }

    const stepX = hist.length > 1 ? (W - 2 * padX) / (hist.length - 1) : 0;
    const points = hist.map((p, i) => {
      const x = padX + i * stepX;
      const y = H - padY - ((p.balance - min) / (max - min)) * (H - 2 * padY);
      return { x, y };
    });

    const linePath = points.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
    const last = points[points.length - 1];
    const first = points[0];
    const areaPath = `${linePath} L${last.x.toFixed(1)},${H} L${first.x.toFixed(1)},${H} Z`;

    const gridLines = [0, 1, 2, 3].map((i) => {
      const y = padY + i * ((H - 2 * padY) / 3);
      return `<line class="gcc-equity-gridline" x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" />`;
    }).join("");

    svg.innerHTML = `
      <defs>
        <linearGradient id="gccEquityGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(20,241,149,0.45)" />
          <stop offset="100%" stop-color="rgba(20,241,149,0)" />
        </linearGradient>
      </defs>
      ${gridLines}
      <path class="gcc-equity-path-area" d="${areaPath}"></path>
      <path class="gcc-equity-path-line" id="equityLinePath" d="${linePath}"></path>
    `;

    const lineEl = document.getElementById("equityLinePath");
    const len = lineEl.getTotalLength();
    lineEl.style.strokeDasharray = `${len}`;
    lineEl.style.strokeDashoffset = `${len}`;
    // force reflow so the transition actually animates from the dashed state
    lineEl.getBoundingClientRect();
    requestAnimationFrame(() => {
      lineEl.style.transition = "stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)";
      lineEl.style.strokeDashoffset = "0";
    });
  }

  /* ---------- recent ticket chips ---------- */

  function renderTicketChips(state) {
    const wrap = document.getElementById("ticketChips");
    const tickets = state.tickets.slice(0, 12);
    if (!tickets.length) {
      wrap.innerHTML = '<div class="gcc-chip-empty">Zatím žádné tikety.</div>';
      return;
    }
    wrap.innerHTML = tickets.map((t) => {
      const sel = t.selections[0] || {};
      const matchup = sel.homeTeam && sel.awayTeam ? `${sel.homeTeam} vs ${sel.awayTeam}` : "Kombinace";
      const extra = t.selections.length > 1 ? ` +${t.selections.length - 1}` : "";
      const shortId = (t.id || "").replace(/\D/g, "").slice(-4) || "0000";
      return `<div class="gcc-ticket-chip">
        <span class="gcc-tag">TICKET #${shortId}</span>
        <div class="gcc-chip-matchup">${escapeHtml(matchup)}${escapeHtml(extra)}</div>
        <div class="gcc-chip-row-bottom">
          <span class="gcc-chip-odds">@ ${t.combinedOdds.toFixed(2)}</span>
          <span class="gcc-status-glow ${t.status}"></span>
        </div>
      </div>`;
    }).join("");
  }

  /* ---------- footer micro-readout ---------- */

  function renderFooterChips(state, summary) {
    const wrap = document.getElementById("footerChips");
    const days = Portfolio.daysRemaining(state);
    wrap.innerHTML = `
      <div class="gcc-foot-chip"><span class="gcc-tag">DAYS LEFT</span><span class="gcc-mono-sm">${days}</span></div>
      <div class="gcc-foot-chip"><span class="gcc-tag">WIN RATE</span><span class="gcc-mono-sm">${summary.winRate}%</span></div>
      <div class="gcc-foot-chip"><span class="gcc-tag">AVG ODDS</span><span class="gcc-mono-sm">${summary.avgOdds.toFixed(2)}</span></div>
      <div class="gcc-foot-chip"><span class="gcc-tag">TICKETS</span><span class="gcc-mono-sm">${summary.total}</span></div>
    `;
  }

  /* ---------- performance: instrument panel ---------- */

  function renderInstrumentPanel(state, summary) {
    const rWr = 68, cWr = 2 * Math.PI * rWr;
    const wrEl = document.getElementById("winrateDialFill");
    wrEl.style.strokeDasharray = `${cWr}`;
    wrEl.style.strokeDashoffset = `${cWr - (summary.winRate / 100) * cWr}`;
    document.getElementById("winrateValue").textContent = `${summary.winRate}%`;

    const rOd = 46, cOd = 2 * Math.PI * rOd;
    const oddsPct = Math.max(0, Math.min(1, summary.avgOdds / 5));
    const odEl = document.getElementById("oddsDialFill");
    odEl.style.strokeDasharray = `${cOd}`;
    odEl.style.strokeDashoffset = `${cOd - oddsPct * cOd}`;
    document.getElementById("oddsValue").textContent = summary.avgOdds ? summary.avgOdds.toFixed(2) : "0.00";

    const maxVal = Math.max(summary.staked, summary.returned, 1);
    document.getElementById("stakedBar").style.width = `${(summary.staked / maxVal) * 100}%`;
    document.getElementById("returnedBar").style.width = `${(summary.returned / maxVal) * 100}%`;
    document.getElementById("stakedValue").textContent = fmtKc(summary.staked);
    document.getElementById("returnedValue").textContent = fmtKc(summary.returned);

    const netEl = document.getElementById("netPnlValue");
    netEl.textContent = fmtSigned(summary.netProfit);
    netEl.classList.toggle("is-negative", summary.netProfit < 0);
    document.getElementById("netWon").textContent = `WON // ${summary.won}`;
    document.getElementById("netLost").textContent = `LOST // ${summary.lost}`;
    document.getElementById("netPending").textContent = `PENDING // ${summary.pending}`;
  }

  /* ---------- performance: daily P&L bar chart ---------- */

  function renderDailyChart(state) {
    const days = Portfolio.dailyNet(state, 14);
    const wrap = document.getElementById("dailyBars");
    const tooltip = document.getElementById("dailyTooltip");
    const panel = wrap.closest(".gcc-daily-wrap");
    const maxAbs = Math.max(...days.map((d) => Math.abs(d.net)), 1);

    wrap.innerHTML = "";

    function positionTooltip(col) {
      const panelRect = panel.getBoundingClientRect();
      const colRect = col.getBoundingClientRect();
      const left = colRect.left - panelRect.left + colRect.width / 2;
      const top = colRect.top - panelRect.top;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    days.forEach((d) => {
      const col = document.createElement("div");
      col.className = "gcc-daily-bar-col";

      const baseline = document.createElement("div");
      baseline.className = "gcc-daily-baseline";

      const bar = document.createElement("div");
      const isPos = d.net > 0, isNeg = d.net < 0;
      bar.className = "gcc-daily-bar " + (isPos ? "is-pos" : isNeg ? "is-neg" : "is-zero");
      const pct = Math.min(46, (Math.abs(d.net) / maxAbs) * 46);
      bar.style.height = `${pct}%`;

      const label = document.createElement("span");
      label.className = "gcc-daily-label";
      label.textContent = (d.label || "").toUpperCase();

      col.appendChild(baseline);
      col.appendChild(bar);
      col.appendChild(label);

      col.addEventListener("mouseenter", () => {
        const dateLabel = new Date(d.key).toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" });
        tooltip.textContent = `${dateLabel} · ${fmtSigned(d.net)}`;
        tooltip.hidden = false;
        positionTooltip(col);
      });
      col.addEventListener("mousemove", () => positionTooltip(col));
      col.addEventListener("mouseleave", () => { tooltip.hidden = true; });

      wrap.appendChild(col);
    });
  }

  /* ---------- performance: mission log (ticket history) ---------- */

  function renderMissionLog(state) {
    const list = document.getElementById("missionLog");
    const tickets = currentLogFilter === "all"
      ? state.tickets
      : state.tickets.filter((t) => t.status === currentLogFilter);

    if (!tickets.length) {
      list.innerHTML = '<div class="gcc-log-empty">Žádné tikety pro tento filtr.</div>';
      return;
    }

    list.innerHTML = tickets.map((t) => {
      const sel = t.selections[0] || {};
      const matchup = sel.homeTeam && sel.awayTeam ? `${sel.homeTeam} vs ${sel.awayTeam}` : "Kombinace";
      const marketLabel = t.selections.length > 1 ? `${t.selections.length}× kombinace` : (sel.marketName || "—");
      const time = new Date(t.placedAt).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      return `<div class="gcc-log-row">
        <span class="gcc-log-time">${time}</span>
        <span class="gcc-log-match">${escapeHtml(matchup)}</span>
        <span class="gcc-log-market">${escapeHtml(marketLabel)}</span>
        <span class="gcc-log-odds">@ ${t.combinedOdds.toFixed(2)}</span>
        <span class="gcc-log-stake">${Math.round(t.stake).toLocaleString("cs-CZ")} Kč</span>
        <span class="gcc-log-badge ${t.status}"><span class="gcc-status-glow ${t.status}"></span>${t.status.toUpperCase()}</span>
      </div>`;
    }).join("");
  }

  function initLogFilters() {
    const filters = document.getElementById("logFilters");
    if (!filters) return;
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".gcc-seg");
      if (!btn) return;
      filters.querySelectorAll(".gcc-seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentLogFilter = btn.dataset.filter;
      const state = Portfolio.get();
      if (state) renderMissionLog(state);
    });
  }

  /* ---------- view switching + ambient backdrop ---------- */

  function initViewNav() {
    const nav = document.getElementById("viewNav");
    if (!nav) return;
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest(".gcc-seg");
      if (!btn) return;
      const view = btn.dataset.view;
      nav.querySelectorAll(".gcc-seg").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.getElementById("view-overview").hidden = view !== "overview";
      document.getElementById("view-performance").hidden = view !== "performance";
      document.getElementById("gccAmbientOverview").classList.toggle("active", view === "overview");
      document.getElementById("gccAmbientPerformance").classList.toggle("active", view === "performance");

      if (view === "performance") {
        renderPerformanceView();
      }
    });
  }

  function renderPerformanceView() {
    const state = Portfolio.get();
    if (!state) return;
    const summary = Portfolio.summary(state);
    renderInstrumentPanel(state, summary);
    renderDailyChart(state);
    renderMissionLog(state);
  }

  /* ---------- ambient parallax on scroll ---------- */

  function initParallax() {
    const ambient = document.getElementById("gccAmbient");
    if (!ambient) return;
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const maxPx = 40;
        const progress = Math.min(1, window.scrollY / 900);
        ambient.style.transform = `translateY(-${(progress * maxPx).toFixed(1)}px) scale(1.03)`;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- init ---------- */

  function init() {
    const state = Portfolio.ensure("advanced");
    const summary = Portfolio.summary(state);

    renderHud(state);
    const dd = renderHero(state);
    renderRadar(state, dd);
    renderEquityChart(state);
    renderTicketChips(state);
    renderFooterChips(state, summary);

    startClock();
    initParallax();
    initViewNav();
    initLogFilters();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
