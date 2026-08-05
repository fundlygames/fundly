/* Fundly — Concept 4: BRUTALIST LEDGER
   Reads the real, shared Portfolio/packages data layer (js/packages.js +
   js/portfolio.js, loaded before this file, both untouched) and renders
   it into the ledger-document markup in dashboard-concept-4-ledger.html.
   No fake data — every number here comes from Portfolio.get()/summary()/
   dailyNet()/drawdownInfo() against the real "bf1:portfolio" localStorage
   record. This file never writes to that key. */

(function () {
  "use strict";

  // ticket-table sort state — declared before the init block below, since
  // renderTicketHistory() (called during init) reads it immediately.
  let sortState = { key: "placedAt", dir: -1 };

  // ---------- formatting helpers ----------

  function money(n) {
    const v = Math.abs(Number(n) || 0);
    return v.toLocaleString("cs-CZ") + " Kč";
  }

  function moneySigned(n) {
    const v = Number(n) || 0;
    const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
    return sign + money(v);
  }

  function pad4(n) {
    return String(n).padStart(4, "0");
  }

  function fmtDateTime(d) {
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function fmtDateShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
  }

  function statusTag(status) {
    switch (status) {
      case "won": return '<span class="status-tag won">[WON]</span>';
      case "lost": return '<span class="status-tag lost">[LOST]</span>';
      case "push": return '<span class="status-tag push">[PUSH]</span>';
      default: return '<span class="status-tag pending">[PENDING] ···</span>';
    }
  }

  function pickLabelFor(ticket) {
    if (!ticket.selections || !ticket.selections.length) return "—";
    if (ticket.selections.length === 1) return ticket.selections[0].pickLabel || "—";
    return `${ticket.selections[0].pickLabel || "—"} +${ticket.selections.length - 1}`;
  }

  function matchLabelFor(ticket) {
    if (!ticket.selections || !ticket.selections.length) return "—";
    const s = ticket.selections[0];
    const teams = `${s.homeTeam || "?"} vs ${s.awayTeam || "?"}`;
    if (ticket.selections.length > 1) return `${teams} (+${ticket.selections.length - 1} legs)`;
    return teams;
  }

  function marketLabelFor(ticket) {
    if (!ticket.selections || !ticket.selections.length) return "—";
    if (ticket.selections.length > 1) return "COMBO";
    return ticket.selections[0].marketName || "—";
  }

  function leagueLabelFor(ticket) {
    if (!ticket.selections || !ticket.selections.length) return "";
    return ticket.selections[0].league || "";
  }

  // ---------- init ----------

  const state = Portfolio.ensure("advanced");
  const pkg = packageByKey(state.packageKey);
  const summary = Portfolio.summary(state);
  const drawdown = Portfolio.drawdownInfo(state);
  const target = Portfolio.phaseTarget(state);

  renderMasthead(state, pkg);
  renderTabs();
  renderBalanceRow(state);
  renderPhaseProgress(state, target);
  renderDrawdownStrip(state, drawdown);
  renderEquityCurve(state);
  renderRecentTickets(state);

  renderStatRail(state, summary);
  renderDailyBarChart(state);
  renderTicketHistory(state);
  renderFooterTally(summary);

  // ---------- masthead ----------

  function renderMasthead(state, pkg) {
    const acctLine = document.getElementById("acctLine");
    acctLine.textContent = `${(state.packageName || pkg.name).toUpperCase()} — ${(state.cap || pkg.cap).toLocaleString("cs-CZ")} Kč CAP`;

    const phaseLabel = state.phase === "funded" ? "FUNDED" : `0${state.phase}`;
    document.getElementById("metaPhase").textContent = phaseLabel;
    document.getElementById("metaDocId").textContent = `BF-${pad4(state.tickets.length)}`;
    document.getElementById("metaDate").textContent = fmtDateTime(new Date());

    const hasPending = state.tickets.some((t) => t.status === "pending");
    document.getElementById("metaLiveWrap").style.display = hasPending ? "" : "none";
  }

  // ---------- tabs ----------

  function renderTabs() {
    const tabs = document.querySelectorAll(".ledger-tab");
    const views = {
      prehled: document.getElementById("view-prehled"),
      vykon: document.getElementById("view-vykon"),
    };
    function activate(key) {
      tabs.forEach((t) => t.classList.toggle("active", t.dataset.view === key));
      Object.keys(views).forEach((k) => views[k].classList.toggle("active", k === key));
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    }
    tabs.forEach((t) => t.addEventListener("click", () => activate(t.dataset.view)));
    const viewAllBtn = document.getElementById("viewAllBtn");
    if (viewAllBtn) viewAllBtn.addEventListener("click", () => activate("vykon"));
  }

  // ---------- balance row ----------

  function renderBalanceRow(state) {
    const opening = state.phaseBaseline;
    const net = state.balance - state.phaseBaseline;
    document.getElementById("ovOpening").textContent = money(opening);
    const netEl = document.getElementById("ovNet");
    netEl.textContent = moneySigned(net);
    netEl.classList.toggle("ink-red", net < 0);
    document.getElementById("ovBalance").textContent = money(state.balance);
  }

  // ---------- phase progress ----------

  function renderPhaseProgress(state, target) {
    const profit = state.balance - state.phaseBaseline;
    const isFunded = state.phase === "funded";
    const pct = isFunded ? 100 : target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 0;

    const TICKS = 20;
    const filledCount = Math.round((pct / 100) * TICKS);
    const rowEl = document.getElementById("phaseTicks");
    rowEl.innerHTML = "";
    for (let i = 0; i < TICKS; i++) {
      const cell = document.createElement("div");
      cell.className = "tick-cell" + (i < filledCount ? " filled" : "");
      cell.textContent = i < filledCount ? "█" : "·";
      rowEl.appendChild(cell);
    }

    const readout = document.getElementById("phaseReadout");
    if (isFunded) {
      readout.innerHTML = `<strong>100.0%</strong> · FUNDED — NO ACTIVE TARGET`;
    } else {
      const remaining = Math.max(0, target - profit);
      readout.innerHTML = `<strong>${pct.toFixed(1)}%</strong> · ${money(profit)} / ${money(target)} TO TARGET${state.phase} · ${money(remaining)} REMAINING`;
    }

    const stampWrap = document.getElementById("phaseStampWrap");
    if (isFunded) {
      stampWrap.innerHTML = `<img class="funded-stamp" src="assets/concept4-funded-stamp.jpg" alt="Funded approval stamp" />`;
    } else {
      stampWrap.innerHTML = "";
    }

    document.getElementById("ruleT1").textContent = money(state.target1);
    document.getElementById("ruleT2").textContent = money(state.target2);
    document.getElementById("ruleDD").textContent = money(state.drawdown);
    document.getElementById("ruleMax").textContent = money(state.maxStake);
    document.getElementById("ruleSplit").textContent = `${state.profitSplit}%`;

    document.getElementById("youT1").textContent = state.phase === 1 ? money(profit) : (state.phase === "funded" || state.phase === 2 ? "✓ CLEARED" : "—");
    document.getElementById("youT2").textContent = state.phase === 2 ? money(profit) : (state.phase === "funded" ? "✓ CLEARED" : "—");
    const usedDD = Math.max(0, state.hwm - state.balance);
    document.getElementById("youDD").textContent = money(usedDD);
    const maxStakeUsed = state.tickets.reduce((m, t) => Math.max(m, t.stake), 0);
    document.getElementById("youMax").textContent = money(maxStakeUsed);
    document.getElementById("youSplit").textContent = state.phase === "funded" ? `${state.profitSplit}%` : "N/A";
  }

  // ---------- drawdown strip ----------

  function renderDrawdownStrip(state, drawdown) {
    const strip = document.getElementById("ddStrip");
    const span = drawdown.hwm - drawdown.floor;
    const pctAlong = span > 0 ? Math.max(0, Math.min(100, ((state.balance - drawdown.floor) / span) * 100)) : 100;
    const danger = span > 0 ? (drawdown.remaining / span) * 100 < 20 : false;

    document.getElementById("ddHwmVal").textContent = money(drawdown.hwm);
    document.getElementById("ddFloorVal").textContent = money(drawdown.floor);

    // tick + label positioned along the 12px..calc(100%-12px) track
    const tick = document.getElementById("ddCurTick");
    const label = document.getElementById("ddCurLabel");
    // position from the right (high balance = left/HWM side, low = right/floor side)
    const leftPct = 100 - pctAlong;
    tick.style.left = `calc(12px + (100% - 24px) * ${leftPct / 100})`;
    label.style.left = `calc(12px + (100% - 24px) * ${leftPct / 100})`;
    label.textContent = money(state.balance);
    tick.classList.toggle("danger", danger);
    label.classList.toggle("danger", danger);
  }

  // ---------- equity curve (blocky sparkline) ----------

  const SPARK_CHARS = ["▁", "▂", "▃", "▅", "▇", "█"];

  function renderEquityCurve(state) {
    const days = Portfolio.dailyNet(state, 14);
    const cell = document.getElementById("sparkCell");
    cell.innerHTML = "";
    const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
    days.forEach((d) => {
      const bar = document.createElement("div");
      bar.className = "spark-bar" + (d.net < 0 ? " neg" : "");
      const h = Math.max(2, Math.round((Math.abs(d.net) / maxAbs) * 100));
      bar.style.height = h + "%";
      bar.title = `${d.label}: ${moneySigned(d.net)}`;
      cell.appendChild(bar);
    });

    const body = document.getElementById("sparkTableBody");
    body.innerHTML = "";
    let running = 0;
    days.forEach((d) => {
      running += d.net;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${d.label.toUpperCase()}</td><td class="mono-num${d.net < 0 ? " ink-red" : ""}">${moneySigned(d.net)}</td><td class="mono-num${running < 0 ? " ink-red" : ""}">${moneySigned(running)}</td>`;
      body.appendChild(tr);
    });
  }

  // ---------- recent tickets (overview) ----------

  function renderRecentTickets(state) {
    const body = document.getElementById("recentTicketsBody");
    body.innerHTML = "";
    const recent = state.tickets.slice(0, 5);
    if (!recent.length) {
      body.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ledger-ink-2);">NO TICKETS ON RECORD YET</td></tr>`;
      return;
    }
    recent.forEach((t, i) => {
      const tr = document.createElement("tr");
      if (i % 2 === 1) tr.classList.add("zebra");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${matchLabelFor(t)}</td>
        <td>${pickLabelFor(t)}</td>
        <td class="mono-num">${t.combinedOdds.toFixed(2)}</td>
        <td class="mono-num">${money(t.stake)}</td>
        <td>${statusTag(t.status)}</td>
      `;
      body.appendChild(tr);
    });
  }

  // ---------- Výkon: stat rail ----------

  function renderStatRail(state, summary) {
    document.getElementById("stWinRate").textContent = `${summary.winRate}%`;
    document.getElementById("stAvgOdds").textContent = summary.avgOdds.toFixed(2);
    document.getElementById("stStaked").textContent = money(summary.staked);
    const netEl = document.getElementById("stNet");
    netEl.textContent = moneySigned(summary.netProfit);
    netEl.classList.toggle("ink-red", summary.netProfit < 0);
    document.getElementById("stRecord").textContent = `${summary.won}W–${summary.lost}L–${summary.pending}P`;
  }

  // ---------- daily bar chart ----------

  function renderDailyBarChart(state) {
    const days = Portfolio.dailyNet(state, 14);
    const chart = document.getElementById("barChart");
    chart.innerHTML = "";
    const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));

    days.forEach((d) => {
      const col = document.createElement("div");
      col.className = "bar-col";

      const top = document.createElement("div");
      top.className = "bar-half top";
      const bottom = document.createElement("div");
      bottom.className = "bar-half bottom";

      const fill = document.createElement("div");
      fill.className = "bar-fill" + (d.net < 0 ? " neg" : "");
      const h = Math.round((Math.abs(d.net) / maxAbs) * 60);
      fill.style.height = Math.max(d.net === 0 ? 0 : 2, h) + "px";

      if (d.net >= 0) {
        top.appendChild(fill);
      } else {
        bottom.appendChild(fill);
      }

      const zero = document.createElement("div");
      zero.className = "bar-zero";

      const date = document.createElement("div");
      date.className = "bar-date";
      date.textContent = d.label.toUpperCase();

      const val = document.createElement("div");
      val.className = "bar-val" + (d.net < 0 ? " neg" : "");
      val.textContent = moneySigned(d.net);

      col.appendChild(top);
      col.appendChild(zero);
      col.appendChild(bottom);
      col.appendChild(date);
      col.appendChild(val);
      chart.appendChild(col);
    });

    const settled = days; // dailyNet already zero-fills unsettled days
    const green = days.filter((d) => d.net > 0).length;
    const red = days.filter((d) => d.net < 0).length;
    const best = days.reduce((m, d) => Math.max(m, d.net), 0);
    const worst = days.reduce((m, d) => Math.min(m, d.net), 0);
    document.getElementById("plSummaryLine").innerHTML =
      `<strong>${green}</strong> GREEN DAYS / <strong>${red}</strong> RED DAYS / BEST ${moneySigned(best)} / WORST ${moneySigned(worst)}`;
  }

  // ---------- ticket history table (sortable) ----------

  function ticketRow(t, i, ticketMap) {
    const net = (t.payout || 0) - t.stake;
    return {
      idx: i + 1,
      id: t.id,
      placedAt: t.placedAt,
      match: matchLabelFor(t),
      league: leagueLabelFor(t),
      market: marketLabelFor(t),
      pick: pickLabelFor(t),
      odds: t.combinedOdds,
      stake: t.stake,
      payout: t.payout || 0,
      net: t.status === "pending" ? null : net,
      status: t.status,
    };
  }

  function renderTicketHistory(state) {
    const rows = state.tickets.map((t, i) => ticketRow(t, i));
    sortRows(rows, sortState.key, sortState.dir);
    paintTicketRows(rows);

    document.querySelectorAll("#ticketHistoryTable thead th").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.sort === sortState.key);
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (sortState.key === key) {
          sortState.dir *= -1;
        } else {
          sortState = { key, dir: 1 };
        }
        const rows2 = state.tickets.map((t, i) => ticketRow(t, i));
        sortRows(rows2, sortState.key, sortState.dir);
        paintTicketRows(rows2);
        document.querySelectorAll("#ticketHistoryTable thead th").forEach((h) => {
          h.classList.toggle("sorted", h.dataset.sort === sortState.key);
          const arrow = h.querySelector(".sort-arrow");
          if (arrow) arrow.textContent = h.dataset.sort === sortState.key ? (sortState.dir === 1 ? "▲" : "▼") : "▲";
        });
      });
    });
  }

  function sortRows(rows, key, dir) {
    rows.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      if (key === "placedAt") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv) * dir;
      }
      av = av === null || av === undefined ? -Infinity : av;
      bv = bv === null || bv === undefined ? -Infinity : bv;
      return (av - bv) * dir;
    });
  }

  function paintTicketRows(rows) {
    const body = document.getElementById("ticketHistoryBody");
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--ledger-ink-2);">NO TICKETS ON RECORD YET</td></tr>`;
      return;
    }
    rows.forEach((r, i) => {
      const tr = document.createElement("tr");
      if (i % 2 === 1) tr.classList.add("zebra");
      const netCell = r.net === null
        ? `<td class="mono-num">—</td>`
        : `<td class="mono-num ${r.net >= 0 ? "net-pos" : "net-neg"}">${moneySigned(r.net)}</td>`;
      tr.innerHTML = `
        <td class="mono-num">${r.id}</td>
        <td>${fmtDateShort(r.placedAt)}</td>
        <td>${r.match}${r.league ? ` <span style="color:var(--ledger-ink-2)">(${r.league})</span>` : ""}</td>
        <td>${r.market}</td>
        <td>${r.pick}</td>
        <td class="mono-num">${r.odds.toFixed(2)}</td>
        <td class="mono-num">${money(r.stake)}</td>
        <td class="mono-num">${r.status === "pending" ? "—" : money(r.payout)}</td>
        ${netCell}
        <td>${statusTag(r.status)}</td>
      `;
      body.appendChild(tr);
    });
  }

  // ---------- footer tally ----------

  function renderFooterTally(summary) {
    const netClass = summary.netProfit < 0 ? " ink-red" : "";
    document.getElementById("footerTally").innerHTML =
      `TOTAL TICKETS: ${summary.total} <span class="sep">·</span> ` +
      `TOTAL STAKED: ${money(summary.staked)} <span class="sep">·</span> ` +
      `TOTAL RETURNED: ${money(summary.returned)} <span class="sep">·</span> ` +
      `NET: <span class="${netClass}">${moneySigned(summary.netProfit)}</span>`;
  }
})();
