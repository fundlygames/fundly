/* Betflow — Trading Terminal concept
   Renders REAL data from the shared Portfolio/packages layer (js/portfolio.js,
   js/packages.js, loaded before this file) into the dense ledger-style UI
   described in the Trading Terminal design brief. No fake numbers. */

(function () {
  "use strict";

  const nfKc = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 });
  const nfPct = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 1 });

  function fmtKc(n) {
    const v = Math.round(n || 0);
    return `${nfKc.format(v)} Kč`;
  }
  function fmtSignedKc(n) {
    const v = Math.round(n || 0);
    const sign = v > 0 ? "+" : v < 0 ? "" : "";
    return `${sign}${nfKc.format(v)} Kč`;
  }
  function fmtOdds(n) {
    return (n || 0).toFixed(2);
  }
  function fmtPct(n) {
    return `${nfPct.format(n || 0)}%`;
  }
  function polarityClass(n) {
    if (n > 0) return "up";
    if (n < 0) return "down";
    return "zero";
  }
  function fmtTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }) +
      " " + d.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" });
  }
  function matchLabel(ticket) {
    const sels = ticket.selections || [];
    if (!sels.length) return "—";
    const first = sels[0];
    const base = `${first.homeTeam || "?"} vs ${first.awayTeam || "?"}`;
    return sels.length > 1 ? `${base} +${sels.length - 1}` : base;
  }
  function marketLabel(ticket) {
    const sels = ticket.selections || [];
    if (!sels.length) return "—";
    if (sels.length > 1) return `COMBO ×${sels.length}`;
    const s = sels[0];
    return s.pickLabel ? `${s.marketName || ""} · ${s.pickLabel}`.replace(/^ · /, "") : (s.marketName || "—");
  }
  function statusClass(status) {
    if (status === "won") return "status-won";
    if (status === "lost") return "status-lost";
    if (status === "push") return "status-push";
    return "status-pending";
  }
  function statusLabel(status) {
    if (status === "won") return "WON";
    if (status === "lost") return "LOST";
    if (status === "push") return "PUSH";
    return "PENDING";
  }
  function ticketPnl(ticket) {
    if (ticket.status === "pending") return null;
    return (ticket.payout || 0) - ticket.stake;
  }

  function computeStreaks(tickets) {
    const settled = tickets
      .filter((t) => t.status === "won" || t.status === "lost")
      .slice()
      .sort((a, b) => new Date(a.settledAt) - new Date(b.settledAt));
    let bestWinStreak = 0;
    let runType = null;
    let running = 0;
    settled.forEach((t) => {
      if (t.status === runType) running++;
      else { runType = t.status; running = 1; }
      if (t.status === "won" && running > bestWinStreak) bestWinStreak = running;
    });
    let curStreak = 0;
    let curType = null;
    if (settled.length) {
      curType = settled[settled.length - 1].status;
      curStreak = 1;
      for (let j = settled.length - 2; j >= 0; j--) {
        if (settled[j].status === curType) curStreak++;
        else break;
      }
    }
    return { bestWinStreak, curStreak, curType };
  }

  function largestWinLoss(tickets) {
    let largestWin = 0;
    let largestLoss = 0;
    tickets.forEach((t) => {
      if (t.status !== "won" && t.status !== "lost") return;
      const pnl = (t.payout || 0) - t.stake;
      if (pnl > largestWin) largestWin = pnl;
      if (pnl < largestLoss) largestLoss = pnl;
    });
    return { largestWin, largestLoss };
  }

  // ============ TICKER STRIP ============
  function renderTicker(state) {
    const summary = Portfolio.summary(state);
    const dd = Portfolio.drawdownInfo(state);
    const streaks = computeStreaks(state.tickets);
    const todayNet = Portfolio.dailyNet(state, 1)[0].net;
    const daysLeft = Portfolio.daysRemaining(state);
    const daysElapsed = 30 - daysLeft;
    const phaseLabel = state.phase === "funded" ? "FUNDED" : `FÁZE ${state.phase}`;
    const streakLabel = streaks.curStreak
      ? `${streaks.curType === "won" ? "W" : "L"}${streaks.curStreak}`
      : "—";

    const chips = [
      { label: "BALANCE", val: fmtKc(state.balance), cls: "" },
      { label: "TODAY", val: fmtSignedKc(todayNet) + (todayNet > 0 ? " ▲" : todayNet < 0 ? " ▼" : ""), cls: polarityClass(todayNet) },
      { label: "WIN%", val: fmtPct(summary.winRate), cls: "" },
      { label: "AVG ODDS", val: fmtOdds(summary.avgOdds), cls: "" },
      { label: "STREAK", val: streakLabel, cls: streaks.curType === "won" ? "up" : streaks.curType === "lost" ? "down" : "" },
      { label: "DD", val: `${fmtPct(dd.pct)} REMAIN`, cls: dd.pct < 25 ? "down" : dd.pct < 55 ? "amber" : "up" },
      { label: "PHASE", val: `${phaseLabel} · DAY ${Math.min(daysElapsed, 30)}/30`, cls: "" },
    ];

    const track = document.getElementById("tickerTrack");
    track.innerHTML = chips.map((c) => `
      <span class="ticker-chip">
        <span class="tk-label">${c.label}</span>
        <span class="tk-val ${c.cls}">${c.val}</span>
      </span>
    `).join("");
  }

  // ============ HEADER ============
  function renderHeader(state) {
    document.getElementById("hdrPkgName").textContent = `${(state.packageName || "").toUpperCase()} · ${fmtKc(state.cap)}`;
    const phaseLabel = state.phase === "funded" ? "FUNDED" : `FÁZE ${state.phase}`;
    document.getElementById("hdrPhaseChip").textContent = phaseLabel;
    const daysLeft = Portfolio.daysRemaining(state);
    const daysElapsed = Math.min(30, 30 - daysLeft);
    document.getElementById("hdrDayCounter").textContent = `DAY ${daysElapsed}/30`;
  }

  // ============ EQUITY CURVE ============
  function renderEquity(state) {
    const hist = state.equityHistory && state.equityHistory.length ? state.equityHistory : [{ t: state.phaseStartedAt, balance: state.balance }];
    const values = hist.map((p) => p.balance);
    const min = Math.min(...values, state.hwm - state.drawdown);
    const max = Math.max(...values, state.hwm);
    const span = Math.max(1, max - min);
    const W = 600, H = 160, PAD = 6;

    const pts = hist.map((p, i) => {
      const x = hist.length > 1 ? (i / (hist.length - 1)) * (W - PAD * 2) + PAD : W / 2;
      const y = H - PAD - ((p.balance - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const first = values[0];
    const last = values[values.length - 1];
    const trendUp = last >= first;
    const lineColor = trendUp ? "var(--tt-green)" : "var(--tt-red)";

    let gridLines = "";
    const gridCount = 4;
    for (let i = 1; i < gridCount; i++) {
      const y = (H / gridCount) * i;
      gridLines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="var(--tt-line-soft)" stroke-width="1" />`;
    }

    const svg = document.getElementById("equitySvg");
    svg.innerHTML = `
      ${gridLines}
      <polyline points="${pts.join(" ")}" fill="none" stroke="${lineColor}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
    `;

    document.getElementById("equityRange").textContent = `${hist.length} PTS`;

    const readout = document.getElementById("equityReadout");
    readout.innerHTML = `
      <div class="ro-item"><span class="ro-label">HWM</span><span class="ro-val up">${fmtKc(state.hwm)}</span></div>
      <div class="ro-item"><span class="ro-label">CURRENT</span><span class="ro-val ${polarityClass(state.balance - state.hwm)}">${fmtKc(state.balance)}</span></div>
      <div class="ro-item"><span class="ro-label">FLOOR</span><span class="ro-val down">${fmtKc(state.hwm - state.drawdown)}</span></div>
    `;
  }

  // ============ DRAWDOWN LEDGER ============
  function renderDrawdown(state) {
    const dd = Portfolio.drawdownInfo(state);
    document.getElementById("ddPctLabel").textContent = `${fmtPct(dd.pct)} USED CAPACITY`;
    document.getElementById("ddFloorLabel").textContent = `FLOOR ${fmtKc(dd.floor)}`;
    document.getElementById("ddHwmLabel").textContent = `HWM ${fmtKc(dd.hwm)}`;

    const fill = document.getElementById("ddBarFill");
    const marker = document.getElementById("ddBarMarker");
    fill.style.width = `${dd.pct.toFixed(1)}%`;
    marker.style.left = `${dd.pct.toFixed(1)}%`;
    fill.style.background = dd.pct < 25 ? "var(--tt-red)" : dd.pct < 55 ? "var(--tt-amber)" : "var(--tt-green)";

    const usedPct = 100 - dd.pct;
    const table = document.getElementById("ddTable");
    table.innerHTML = `
      <div class="kv-row"><span class="kv-k">HWM</span><span class="kv-v">${fmtKc(dd.hwm)}</span></div>
      <div class="kv-row"><span class="kv-k">FLOOR</span><span class="kv-v down">${fmtKc(dd.floor)}</span></div>
      <div class="kv-row"><span class="kv-k">REMAINING</span><span class="kv-v up">${fmtKc(dd.remaining)}</span></div>
      <div class="kv-row"><span class="kv-k">USED</span><span class="kv-v ${usedPct > 75 ? "down" : usedPct > 45 ? "amber" : ""}">${fmtPct(usedPct)}</span></div>
    `;
  }

  // ============ PHASE PROGRESS TABLE ============
  function phaseRow(label, target, current, done) {
    const remaining = Math.max(0, target - current);
    const pct = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
    const cls = done ? "up" : current < 0 ? "down" : "";
    return `
      <tr>
        <td>${label}</td>
        <td class="num-col">${fmtKc(target)}</td>
        <td class="num-col ${cls}">${fmtSignedKc(current)}</td>
        <td class="num-col">${fmtKc(remaining)}</td>
        <td class="num-col ${done ? "up" : ""}">${pct.toFixed(0)}%</td>
      </tr>
    `;
  }

  function renderPhase(state) {
    const sub = document.getElementById("phaseLabelSub");
    const daysLeft = Portfolio.daysRemaining(state);
    sub.textContent = `${daysLeft} DAYS LEFT`;

    const p1Current = state.phase === 1 ? state.balance - state.phaseBaseline : state.target1;
    const p1Done = state.phase !== 1;
    const p2Current = state.phase === 2 ? state.balance - state.phaseBaseline : (state.phase === "funded" ? state.target2 : 0);
    const p2Done = state.phase === "funded";

    const rows = [
      phaseRow("PHASE 1", state.target1, p1Current, p1Done),
      phaseRow("PHASE 2", state.target2, p2Current, p2Done),
    ];

    const table = document.getElementById("phaseTable");
    table.innerHTML = `
      <table class="phase-mini-table">
        <thead>
          <tr>
            <th>TARGET</th>
            <th class="num-col">GOAL</th>
            <th class="num-col">CURRENT</th>
            <th class="num-col">REMAIN</th>
            <th class="num-col">%</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>
    `;
  }

  // ============ LIVE P&L SNAPSHOT ============
  function sparklineSvg(days, w, h) {
    const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
    const step = w / Math.max(1, days.length);
    let bars = "";
    days.forEach((d, i) => {
      const barH = Math.max(1, (Math.abs(d.net) / maxAbs) * (h / 2 - 1));
      const x = i * step + step * 0.2;
      const bw = step * 0.6;
      const color = d.net > 0 ? "var(--tt-green)" : d.net < 0 ? "var(--tt-red)" : "var(--tt-text-muted)";
      const y = d.net >= 0 ? h / 2 - barH : h / 2;
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${barH.toFixed(1)}" fill="${color}" />`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none">
      <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="var(--tt-line-soft)" stroke-width="1" />
      ${bars}
    </svg>`;
  }

  function renderPnlSnapshot(state) {
    const sets = [
      { label: "TODAY", days: Portfolio.dailyNet(state, 1) },
      { label: "7D", days: Portfolio.dailyNet(state, 7) },
      { label: "30D", days: Portfolio.dailyNet(state, 30) },
    ];
    const rows = sets.map((s) => {
      const net = s.days.reduce((a, d) => a + d.net, 0);
      return `
        <div class="pnl-row">
          <span class="pr-label">${s.label}</span>
          <span class="pr-spark">${sparklineSvg(s.days, 120, 18)}</span>
          <span class="pr-val ${polarityClass(net)}">${fmtSignedKc(net)}</span>
        </div>
      `;
    });
    document.getElementById("pnlRows").innerHTML = rows.join("");
  }

  // ============ RECENT TICKETS TABLE ============
  function ticketRowHtml(t) {
    const pnl = ticketPnl(t);
    const pnlText = pnl === null ? "—" : fmtSignedKc(pnl);
    const pnlCls = pnl === null ? "pnl-zero" : pnl > 0 ? "pnl-up" : pnl < 0 ? "pnl-down" : "pnl-zero";
    return `
      <tr>
        <td>${fmtTime(t.placedAt)}</td>
        <td class="match-cell">${matchLabel(t)}</td>
        <td>${marketLabel(t)}</td>
        <td class="num-col">${fmtOdds(t.combinedOdds)}</td>
        <td class="num-col">${fmtKc(t.stake)}</td>
        <td class="${statusClass(t.status)}">${statusLabel(t.status)}</td>
        <td class="num-col ${pnlCls}">${pnlText}</td>
      </tr>
    `;
  }

  function renderTicketsTable(state) {
    document.getElementById("ticketsCount").textContent = `${state.tickets.length} TOTAL`;
    const tbody = document.getElementById("ticketsTbody");
    const recent = state.tickets.slice(0, 8);
    if (!recent.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="term-table-empty">NO TICKETS YET — PLACE YOUR FIRST BET TO SEE LIVE ROWS HERE.</td></tr>`;
      return;
    }
    tbody.innerHTML = recent.map(ticketRowHtml).join("");
  }

  // ============ SUBTABS (Limity / Pravidla / Cesta) ============
  function renderLimity(state) {
    const dd = Portfolio.drawdownInfo(state);
    const el = document.getElementById("ovLimity");
    el.innerHTML = `
      <div class="ledger-line"><span class="ledger-k">01</span><span class="ledger-v">MAX. VKLAD NA TIKET — <b class="ledger-v">${fmtKc(state.maxStake)}</b></span></div>
      <div class="ledger-line"><span class="ledger-k">02</span><span class="ledger-v">TRAILING DRAWDOWN LIMIT — <b class="ledger-v">${fmtKc(state.drawdown)}</b></span></div>
      <div class="ledger-line"><span class="ledger-k">03</span><span class="ledger-v">ZBÝVAJÍCÍ REZERVA DO FLOOR — <b class="ledger-v ${dd.pct < 25 ? "down" : "up"}">${fmtKc(dd.remaining)} (${fmtPct(dd.pct)})</b></span></div>
      <div class="ledger-line"><span class="ledger-k">04</span><span class="ledger-v">ČASOVÝ LIMIT FÁZE — <b class="ledger-v">30 DNÍ · ${Portfolio.daysRemaining(state)} ZBÝVÁ</b></span></div>
      <div class="ledger-line"><span class="ledger-k">05</span><span class="ledger-v">DENNÍ LIMIT — <b class="ledger-v">ŽÁDNÝ</b></span></div>
    `;
  }

  function renderPravidla(state) {
    const el = document.getElementById("ovPravidla");
    el.innerHTML = `
      <div class="ledger-line"><span class="ledger-k">01</span><span class="ledger-v">BALÍČEK — <b class="ledger-v">${(state.packageName || "").toUpperCase()}</b></span></div>
      <div class="ledger-line"><span class="ledger-k">02</span><span class="ledger-v">KAPITÁL — <b class="ledger-v">${fmtKc(state.cap)}</b></span></div>
      <div class="ledger-line"><span class="ledger-k">03</span><span class="ledger-v">CENA BALÍČKU — <b class="ledger-v">${fmtKc(state.price)}</b></span></div>
      <div class="ledger-line"><span class="ledger-k">04</span><span class="ledger-v">PROFIT SPLIT — <b class="ledger-v up">${state.profitSplit}%</b></span></div>
      <div class="ledger-line"><span class="ledger-k">05</span><span class="ledger-v">TARGET FÁZE 1 — <b class="ledger-v">${fmtKc(state.target1)}</b></span></div>
      <div class="ledger-line"><span class="ledger-k">06</span><span class="ledger-v">TARGET FÁZE 2 — <b class="ledger-v">${fmtKc(state.target2)}</b></span></div>
    `;
  }

  function renderCesta(state) {
    const steps = [
      { key: 1, label: "FÁZE 1", done: state.phase !== 1, active: state.phase === 1 },
      { key: 2, label: "FÁZE 2", done: state.phase === "funded", active: state.phase === 2 },
      { key: "funded", label: "FUNDED ÚČET", done: false, active: state.phase === "funded" },
    ];
    const el = document.getElementById("ovCesta");
    el.innerHTML = steps.map((s, i) => {
      const status = s.done ? "SPLNĚNO" : s.active ? "PROBÍHÁ" : "ČEKÁ";
      const cls = s.done ? "up" : s.active ? "amber" : "";
      return `<div class="ledger-line"><span class="ledger-k">${String(i + 1).padStart(2, "0")}</span><span class="ledger-v">${s.label} — <b class="ledger-v ${cls}">${status}</b></span></div>`;
    }).join("") + `
      <div class="ledger-line"><span class="ledger-k">04</span><span class="ledger-v">ZAHÁJENO — <b class="ledger-v">${fmtTime(state.phaseStartedAt)}</b></span></div>
    `;
  }

  function bindOvSubtabs() {
    const tabs = document.querySelectorAll("#ovSubtabs [data-ovtab]");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.forEach((b) => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        const key = btn.getAttribute("data-ovtab");
        document.querySelectorAll("[data-ovpanel]").forEach((p) => {
          p.hidden = p.getAttribute("data-ovpanel") !== key;
        });
      });
    });
  }

  // ============ PŘEHLED: full render ============
  function renderPrehled(state) {
    renderHeader(state);
    renderEquity(state);
    renderDrawdown(state);
    renderPhase(state);
    renderPnlSnapshot(state);
    renderTicketsTable(state);
    renderLimity(state);
    renderPravidla(state);
    renderCesta(state);
  }

  // ============ VÝKON: quote board ============
  function qbCell(label, value, cls, glyph, glyphCls) {
    return `
      <div class="qb-cell">
        <span class="qb-label">${label}</span>
        <div class="qb-value-row">
          <span class="qb-value ${cls || ""}">${value}</span>
          <span class="qb-glyph ${glyphCls || "flat"}">${glyph || "—"}</span>
        </div>
      </div>
    `;
  }

  function renderQuoteBoard(state) {
    const summary = Portfolio.summary(state);
    const streaks = computeStreaks(state.tickets);
    const { largestWin, largestLoss } = largestWinLoss(state.tickets);
    const avgStake = summary.total ? summary.staked / summary.total : 0;

    const cells = [
      qbCell("WIN RATE", fmtPct(summary.winRate), "", summary.winRate >= 50 ? "▲" : "▼", summary.winRate >= 50 ? "up" : "down"),
      qbCell("AVG ODDS", fmtOdds(summary.avgOdds), "", "◆", "flat"),
      qbCell("TOTAL STAKED", fmtKc(summary.staked), "", "◆", "flat"),
      qbCell("TOTAL RETURNED", fmtKc(summary.returned), "", "◆", "flat"),
      qbCell("NET P&L", fmtSignedKc(summary.netProfit), polarityClass(summary.netProfit), summary.netProfit >= 0 ? "▲" : "▼", polarityClass(summary.netProfit)),
      qbCell("BEST STREAK", `${streaks.bestWinStreak}W`, "up", "▲", "up"),
      qbCell("CURRENT STREAK", streaks.curStreak ? `${streaks.curStreak}${streaks.curType === "won" ? "W" : "L"}` : "—", streaks.curType === "won" ? "up" : streaks.curType === "lost" ? "down" : "", streaks.curType === "won" ? "▲" : streaks.curType === "lost" ? "▼" : "—", streaks.curType === "won" ? "up" : streaks.curType === "lost" ? "down" : "flat"),
      qbCell("AVG STAKE", fmtKc(avgStake), "", "◆", "flat"),
      qbCell("LARGEST WIN", fmtSignedKc(largestWin), "up", "▲", "up"),
      qbCell("LARGEST LOSS", fmtSignedKc(largestLoss), largestLoss < 0 ? "down" : "", largestLoss < 0 ? "▼" : "—", largestLoss < 0 ? "down" : "flat"),
    ];
    document.getElementById("quoteBoard").innerHTML = cells.join("");
  }

  // ============ VÝKON: zero-line bar strip ============
  function renderBarStrip(state) {
    const days = Portfolio.dailyNet(state, 14);
    const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
    const wrap = document.getElementById("barStrip");
    const tooltip = document.getElementById("barTooltip");

    wrap.innerHTML = days.map((d, i) => {
      const pct = (Math.abs(d.net) / maxAbs) * 50;
      const dir = d.net > 0 ? "up" : d.net < 0 ? "down" : "";
      const date = new Date(new Date().getTime() - (days.length - 1 - i) * 86400000);
      const tick = date.toLocaleDateString("cs-CZ", { day: "2-digit", month: "2-digit" });
      return `
        <div class="bar-col" data-idx="${i}" data-net="${d.net}" data-label="${tick}">
          <div class="bar-col-bars">
            <div class="bar-zero-line"></div>
            ${d.net !== 0 ? `<div class="bar-shape ${dir}" style="height:${pct.toFixed(1)}%"></div>` : ""}
          </div>
          <span class="bar-col-tick">${tick}</span>
        </div>
      `;
    }).join("");

    wrap.querySelectorAll(".bar-col").forEach((col) => {
      col.addEventListener("mouseenter", () => showBarTooltip(col, tooltip));
      col.addEventListener("click", () => showBarTooltip(col, tooltip));
      col.addEventListener("mouseleave", () => { tooltip.hidden = true; });
    });
  }

  function showBarTooltip(col, tooltip) {
    const net = Number(col.getAttribute("data-net"));
    const label = col.getAttribute("data-label");
    tooltip.innerHTML = `<span class="bt-day">${label}</span><span class="bt-val ${polarityClass(net)}">${fmtSignedKc(net)}</span>`;
    const wrapRect = col.parentElement.getBoundingClientRect();
    const colRect = col.getBoundingClientRect();
    tooltip.style.left = `${colRect.left - wrapRect.left + colRect.width / 2}px`;
    tooltip.hidden = false;
  }

  // ============ VÝKON: full ticket history ============
  let historyState = { tickets: [], shown: 0, pageSize: 20 };

  function renderHistoryRows() {
    const tbody = document.getElementById("historyTbody");
    const slice = historyState.tickets.slice(0, historyState.shown);
    if (!slice.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="term-table-empty">NO TICKETS IN LEDGER YET.</td></tr>`;
    } else {
      tbody.innerHTML = slice.map(ticketRowHtml).join("");
    }
    const btn = document.getElementById("loadMoreBtn");
    const remaining = historyState.tickets.length - historyState.shown;
    if (remaining <= 0) {
      btn.textContent = "ALL ROWS LOADED";
      btn.disabled = true;
    } else {
      btn.textContent = `LOAD MORE ROWS ↓ (${remaining} REMAINING)`;
      btn.disabled = false;
    }
  }

  function renderHistory(state) {
    historyState.tickets = state.tickets;
    historyState.shown = Math.min(state.tickets.length, historyState.pageSize);
    document.getElementById("historyCount").textContent = `${state.tickets.length} ROWS`;
    renderHistoryRows();
  }

  function bindLoadMore() {
    document.getElementById("loadMoreBtn").addEventListener("click", () => {
      historyState.shown = Math.min(historyState.tickets.length, historyState.shown + historyState.pageSize);
      renderHistoryRows();
    });
  }

  // ============ VÝKON: full render ============
  function renderVykon(state) {
    renderQuoteBoard(state);
    renderBarStrip(state);
    renderHistory(state);
  }

  // ============ VIEW SWITCHING ============
  function bindViewTabs() {
    const tabs = document.querySelectorAll(".term-tab[data-view]");
    tabs.forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-view");
        tabs.forEach((b) => b.classList.toggle("active", b === btn));
        document.querySelectorAll(".term-view").forEach((v) => {
          v.hidden = v.id !== `view-${view}`;
        });
      });
    });
  }

  // ============ CTA ============
  function bindCta() {
    const cta = document.getElementById("ctaBet");
    if (cta) {
      cta.addEventListener("click", () => { window.location.href = "dashboard.html"; });
    }
  }

  // ============ INIT ============
  function init() {
    const state = Portfolio.ensure("advanced");
    renderTicker(state);
    renderPrehled(state);
    renderVykon(state);
    bindOvSubtabs();
    bindViewTabs();
    bindCta();
    bindLoadMore();

    // Attempt to settle any due tickets against live odds data, then
    // re-render with fresh numbers. Never mutates anything if it fails.
    if (typeof Portfolio.checkSettlements === "function") {
      Portfolio.checkSettlements().then((updated) => {
        if (!updated) return;
        renderTicker(updated);
        renderPrehled(updated);
        renderVykon(updated);
      }).catch(() => {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
