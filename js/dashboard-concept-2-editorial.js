/* ============================================================
   Fundly — "Editorial Analytics" concept (koncept 2)
   Reads REAL Portfolio/packages state, renders it into the
   magazine-style layout defined in dashboard-concept-2-editorial.html.
   ============================================================ */

const eczk = (n) => Math.round(n).toLocaleString("cs-CZ") + " Kč";
const esign = (n) => (n >= 0 ? "+" : "");

function edFmtDateShort(d) {
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

/* ---------- view switching ---------- */
function edShowView(name) {
  document.querySelectorAll(".ed-view").forEach((v) => {
    v.hidden = v.id !== `view-${name}`;
  });
  document.querySelectorAll(".ed-view-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === name);
  });
  if (name === "prehled") edRenderPrehled();
  if (name === "vykon") edRenderVykon();
}

document.querySelectorAll(".ed-view-tab").forEach((btn) => {
  btn.addEventListener("click", () => edShowView(btn.dataset.view));
});

/* ---------- subtabs (Přehled → Podrobnosti výzvy) ---------- */
document.querySelectorAll("#edSubtabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#edSubtabs button").forEach((b) => {
      b.classList.toggle("active", b === btn);
      b.setAttribute("aria-selected", b === btn ? "true" : "false");
    });
    document.querySelectorAll(".ed-subpanel").forEach((p) => {
      p.hidden = p.dataset.subpanel !== btn.dataset.subtab;
    });
  });
});

/* ---------- small inline SVG line chart helper ---------- */
function edLineSvg(points, { w, h, pad = 6, stroke, strokeWidth = 2 }) {
  if (!points.length) return "";
  if (points.length === 1) points = [points[0], points[0]];
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((v, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${coords.join(" ")}" fill="none" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round" style="stroke:${stroke}" />
  </svg>`;
}

/* ============================================================
   PŘEHLED
   ============================================================ */
function edRenderPrehled() {
  const state = Portfolio.ensure("advanced");
  const s = Portfolio.summary(state);

  /* 1. masthead strip */
  const phaseLabel = state.phase === "funded" ? "FINANCOVANÝ ÚČET" : `FÁZE ${state.phase}`;
  const daysLeft = Portfolio.daysRemaining(state);
  const dayOfChallenge = Math.max(1, 30 - daysLeft);
  document.getElementById("edMastPackage").textContent = state.packageName.toUpperCase();
  document.getElementById("edMastPhase").textContent = phaseLabel;
  document.getElementById("edMastDay").textContent = state.phase === "funded"
    ? "BEZ ČASOVÉHO LIMITU"
    : `DEN ${dayOfChallenge} Z 30`;

  /* 2. hero balance story */
  document.getElementById("edBalance").textContent = eczk(state.balance);

  let prose = `${esign(s.netProfit)}${eczk(s.netProfit)} od začátku výzvy`;
  const topSport = edTopSport(state);
  if (topSport) prose += `, poháněno hlavně sportem ${topSport}.`;
  else if (state.tickets.length === 0) prose = "Zatím žádná aktivita — vsaďte první tiket v sekci Sázení a zahajte příběh svého účtu.";
  else prose += ".";
  document.getElementById("edBalanceProse").textContent = prose;

  const sparkPoints = state.equityHistory.slice(-14).map((p) => p.balance);
  document.getElementById("edSparkline").innerHTML = edLineSvg(sparkPoints, {
    w: 120, h: 48, pad: 3, stroke: "var(--ed-profit)", strokeWidth: 1.6,
  });

  /* 3. phase progress, typographic fraction */
  const progressSection = document.getElementById("edProgressSection");
  if (state.phase === "funded") {
    document.getElementById("edProgressKicker").textContent = "POSTUP · FINANCOVANÝ ÚČET";
    document.getElementById("edProgressCurrent").textContent = eczk(state.balance);
    document.getElementById("edProgressTarget").textContent = "NEOMEZENO";
    document.getElementById("edProgressFill").style.width = "100%";
    document.getElementById("edProgressProse").textContent = "Fáze skončily, obchodujete s kapitálem firmy bez dalšího profitového cíle. Jediné pravidlo, které nadále platí, je trailing drawdown.";
  } else {
    const target = Portfolio.phaseTarget(state);
    const profit = Math.max(0, state.balance - state.phaseBaseline);
    const pct = target > 0 ? Math.max(0, Math.min(100, (profit / target) * 100)) : 100;
    document.getElementById("edProgressKicker").textContent = `POSTUP · FÁZE ${state.phase}`;
    document.getElementById("edProgressCurrent").textContent = eczk(profit).replace(" Kč", "");
    document.getElementById("edProgressTarget").textContent = eczk(target).replace(" Kč", "");
    document.getElementById("edProgressFill").style.width = pct.toFixed(1) + "%";
    const toGoal = Math.max(0, target - profit);
    const pace = daysLeft > 0 ? Math.ceil(toGoal / daysLeft) : toGoal;
    document.getElementById("edProgressProse").textContent = toGoal <= 0
      ? `Cíl fáze ${state.phase} je splněn — čekáte na vyhodnocení posledních tiketů, než se posunete dál.`
      : `Fáze ${state.phase} postoupila o ${Math.round(pct)} % za ${dayOfChallenge} dní obchodování. Zbývá ${daysLeft} dní, na cíl potřebujete v průměru ${eczk(pace)} denně.`;
  }

  /* 4. equity curve, told large */
  const eqPoints = state.equityHistory;
  if (eqPoints.length < 2) {
    document.getElementById("edEquityChart").innerHTML = `<p class="ed-prose">Křivka se naplní, jakmile proběhne první vsazený a vyhodnocený tiket.</p>`;
    document.getElementById("edEquityAnnotation").textContent = "";
  } else {
    document.getElementById("edEquityChart").innerHTML = edLineSvg(
      eqPoints.map((p) => p.balance),
      { w: 900, h: 360, pad: 8, stroke: "var(--ed-profit)", strokeWidth: 2.5 }
    );
    let peak = eqPoints[0];
    eqPoints.forEach((p) => { if (p.balance > peak.balance) peak = p; });
    const fromPeakPct = peak.balance > 0 ? ((state.balance - peak.balance) / peak.balance) * 100 : 0;
    const peakDate = edFmtDateShort(new Date(peak.t));
    document.getElementById("edEquityAnnotation").innerHTML =
      `Nejvyšší bod: ${peakDate} · ${fromPeakPct >= 0 ? "+" : ""}${fromPeakPct.toFixed(1)} % od maxima`;
  }

  /* 5. drawdown, quiet stat */
  const dd = Portfolio.drawdownInfo(state);
  document.getElementById("edDrawdownAmount").textContent = `${eczk(Math.round(dd.remaining))} · ${Math.round(dd.pct)} %`;
  const zone = dd.pct >= 50 ? "bezpečná" : dd.pct >= 20 ? "sledovaná" : "riziková";
  document.getElementById("edDrawdownProse").textContent =
    `Máte ${eczk(Math.round(dd.remaining))} rezervy do floor limitu (${eczk(dd.floor)}), to je ${zone} zóna.`;

  /* 6. recent tickets, editorial log */
  const recent = state.tickets.slice(0, 4);
  const logEl = document.getElementById("edTicketLog");
  if (!recent.length) {
    logEl.innerHTML = `<p class="ed-log-empty">Zatím žádné tikety. Vsaďte první v sekci Sázení.</p>`;
  } else {
    logEl.innerHTML = recent.map((t) => edTicketLogRow(t)).join("");
  }

  /* 7. subtabs — limity / pravidla / cesta */
  document.getElementById("edLimity").innerHTML = `
    <div class="ed-rule-row"><span>Trailing drawdown <small>(HWM ${eczk(dd.hwm)})</small></span><span><b>${eczk(Math.round(dd.remaining))} zbývá</b></span></div>
    <div class="ed-rule-row"><span>Floor limit</span><span><b>${eczk(dd.floor)}</b></span></div>
    <div class="ed-rule-row"><span>Max. sázka na tiket</span><span><b>${eczk(state.maxStake)}</b></span></div>
    <div class="ed-rule-row"><span>Časový limit fáze</span><span><b>30 dní</b></span></div>`;

  document.getElementById("edPravidla").innerHTML = `
    <div class="ed-rule-row"><span>Profit split</span><span class="flag"><b>${state.profitSplit} %</b></span></div>
    <div class="ed-rule-row"><span>Kapitál balíčku</span><span><b>${eczk(state.cap)}</b></span></div>
    <div class="ed-rule-row"><span>Cíl fáze 1</span><span><b>+${eczk(state.target1)}</b></span></div>
    <div class="ed-rule-row"><span>Cíl fáze 2</span><span><b>+${eczk(state.target2)}</b></span></div>
    <div class="ed-rule-row"><span>Trailing drawdown</span><span><b>${eczk(state.drawdown)}</b></span></div>`;

  const steps = [
    { title: "Fáze 1 · Fundly výzva", desc: `Cíl +${eczk(state.target1)}` },
    { title: "Fáze 2 · Verifikace", desc: `Cíl +${eczk(state.target2)}` },
    { title: "Financovaný účet", desc: `${state.profitSplit} % podíl na zisku, neomezený čas, pravidelné výplaty.` },
  ];
  const currentIndex = state.phase === "funded" ? 2 : state.phase - 1;
  document.getElementById("edCesta").innerHTML = `<div class="ed-journey">${steps.map((step, i) => {
    const cls = i < currentIndex ? "done" : i === currentIndex ? "now" : "";
    const mark = i < currentIndex ? "✓" : String(i + 1);
    return `<div class="ed-journey-step ${cls}">
      <span class="ed-journey-num">${mark}</span>
      <span class="ed-journey-body"><span class="t">${step.title}</span><span class="d">${step.desc}</span></span>
    </div>`;
  }).join("")}</div>`;
}

function edTopSport(state) {
  const settled = state.tickets.filter((t) => t.status === "won" || t.status === "lost");
  if (!settled.length) return null;
  const bySport = {};
  settled.forEach((t) => {
    const sport = (t.selections[0] && t.selections[0].sport) || "ostatní";
    const net = (t.payout || 0) - t.stake;
    bySport[sport] = (bySport[sport] || 0) + net;
  });
  let top = null;
  Object.entries(bySport).forEach(([sport, net]) => {
    if (!top || net > top[1]) top = [sport, net];
  });
  return top && top[1] > 0 ? top[0] : null;
}

function edTicketLogRow(t) {
  const label = t.selections.length > 1
    ? `${t.selections.length}× akumulátor`
    : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`;
  const pick = t.selections.length > 1
    ? t.selections.map((s) => s.pickLabel).join(", ")
    : (t.selections[0].pickLabel || t.selections[0].marketName || "");
  const cls = t.status === "won" ? "won" : t.status === "lost" ? "lost" : "";
  const statusText = t.status === "won" ? "Výhra" : t.status === "lost" ? "Prohra" : t.status === "push" ? "Vráceno" : "Čeká";
  return `<div class="ed-log-row">
    <div class="ed-log-main">
      <div class="ed-log-match">${label}</div>
      <div class="ed-log-pick">${pick} · kurz ${t.combinedOdds.toFixed(2)}</div>
    </div>
    <div class="ed-log-outcome ${cls}">
      <b>${statusText}</b>${eczk(t.stake)}
    </div>
  </div>`;
}

/* ============================================================
   VÝKON
   ============================================================ */
let edTicketSort = { key: "match", dir: "desc" };

function edRenderVykon() {
  const state = Portfolio.ensure("advanced");
  const s = Portfolio.summary(state);

  /* 1. section masthead */
  document.getElementById("edVykonKicker").textContent = `STATISTIKY · ${s.total} TIKETŮ CELKEM`;

  /* 2. headline stat + ticker strip */
  const heroKicker = document.getElementById("edHeroStatKicker");
  const heroVal = document.getElementById("edHeroStat");
  if (s.winRate >= 50 && (s.won + s.lost) > 0) {
    heroKicker.textContent = "ÚSPĚŠNOST";
    heroVal.textContent = `${s.winRate} %`;
  } else {
    heroKicker.textContent = "ČISTÝ ZISK";
    heroVal.textContent = `${esign(s.netProfit)}${eczk(s.netProfit)}`;
  }

  document.getElementById("edTickerStrip").innerHTML = `
    <div class="ed-ticker-item"><div class="ed-ticker-label">Průměrný kurz</div><div class="ed-ticker-value">${s.avgOdds.toFixed(2)}</div></div>
    <div class="ed-ticker-item"><div class="ed-ticker-label">Vsazeno celkem</div><div class="ed-ticker-value">${eczk(s.staked)}</div></div>
    <div class="ed-ticker-item"><div class="ed-ticker-label">Výhry / prohry</div><div class="ed-ticker-value">${s.won} / ${s.lost}</div></div>
    <div class="ed-ticker-item"><div class="ed-ticker-label">Čekající</div><div class="ed-ticker-value">${s.pending}</div></div>`;

  /* 3. daily P&L bar essay */
  const days = Portfolio.dailyNet(state, 30);
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  const barsWrap = document.getElementById("edBarsChart");
  barsWrap.innerHTML = days.map((d) => {
    if (d.net === 0) return `<div class="ed-bar-col"></div>`;
    const heightPct = Math.max(4, Math.min(50, (Math.abs(d.net) / maxAbs) * 50));
    const cls = d.net > 0 ? "pos" : "neg";
    return `<div class="ed-bar-col"><span class="ed-bar ${cls}" style="height:${heightPct}%"></span></div>`;
  }).join("");

  let best = null, worst = null;
  days.forEach((d) => {
    if (d.net > 0 && (!best || d.net > best.net)) best = d;
    if (d.net < 0 && (!worst || d.net < worst.net)) worst = d;
  });
  const n = days.length;
  const calloutHtml = [];
  if (best) {
    const idx = days.indexOf(best);
    const dt = edFmtDateShort(new Date(best.key));
    calloutHtml.push(`<span class="ed-bar-callout best" style="left:${((idx + 0.5) / n) * 100}%">Nejlepší den: +${eczk(best.net)}<br>${dt}</span>`);
  }
  if (worst) {
    const idx = days.indexOf(worst);
    const dt = edFmtDateShort(new Date(worst.key));
    calloutHtml.push(`<span class="ed-bar-callout worst" style="left:${((idx + 0.5) / n) * 100}%">Nejhorší den: ${eczk(worst.net)}<br>${dt}</span>`);
  }
  barsWrap.style.position = "relative";
  barsWrap.insertAdjacentHTML("beforeend", calloutHtml.join(""));

  /* 4. ticket table */
  edRenderTicketTable(state);

  /* 5. editor's note */
  const cmp = s.winRate >= 55 ? "výrazně nad" : s.winRate >= 50 ? "nad" : s.winRate >= 40 ? "těsně pod" : "pod";
  document.getElementById("edEditorNote").textContent = s.total
    ? `Za dobu výzvy jste vsadili ${s.total} tiketů s úspěšností ${s.winRate} %, což je ${cmp} průměrem balíčku ${state.packageName}.`
    : `Zatím bez záznamu — jakmile vsadíte první tiket, tady se objeví jeho editorský rozbor.`;

  edBindTableSort(state);
}

function edTicketRows(state) {
  return state.tickets.map((t) => ({
    id: t.id,
    matchLabel: t.selections.length > 1
      ? `${t.selections.length}× akumulátor`
      : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`,
    pickLabel: t.selections.length > 1
      ? `${t.selections.length} výběrů`
      : (t.selections[0].pickLabel || t.selections[0].marketName || ""),
    odds: t.combinedOdds,
    stake: t.stake,
    status: t.status,
    payout: t.payout || 0,
    placedAt: t.placedAt,
  }));
}

const ED_STATUS_TEXT = { won: "VYHRÁNO", lost: "PROHRÁNO", pending: "ČEKÁ", push: "VRÁCENO" };
const ED_STATUS_RANK = { won: 3, push: 2, pending: 1, lost: 0 };

function edRenderTicketTable(state) {
  const rows = edTicketRows(state);
  const { key, dir } = edTicketSort;
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    let av, bv;
    if (key === "match") { av = a.matchLabel; bv = b.matchLabel; return av.localeCompare(bv) * mul; }
    if (key === "status") { av = ED_STATUS_RANK[a.status]; bv = ED_STATUS_RANK[b.status]; return (av - bv) * mul; }
    if (key === "odds") { av = a.odds; bv = b.odds; return (av - bv) * mul; }
    if (key === "stake") { av = a.stake; bv = b.stake; return (av - bv) * mul; }
    if (key === "payout") { av = a.payout; bv = b.payout; return (av - bv) * mul; }
    av = new Date(a.placedAt).getTime(); bv = new Date(b.placedAt).getTime();
    return (av - bv) * mul;
  });

  const body = document.getElementById("edTicketTableBody");
  body.innerHTML = rows.length ? rows.map((r) => `
    <tr>
      <td class="match"><span class="m">${r.matchLabel}</span><span class="p">${r.pickLabel} · ${r.odds.toFixed(2)}</span></td>
      <td class="num">${r.odds.toFixed(2)}</td>
      <td class="num">${eczk(r.stake)}</td>
      <td><span class="ed-status ${r.status}">${ED_STATUS_TEXT[r.status] || r.status}</span></td>
      <td class="num">${r.payout ? eczk(r.payout) : "—"}</td>
    </tr>`).join("") : `<tr><td colspan="5" class="ed-table-empty">Zatím žádné tikety.</td></tr>`;

  document.querySelectorAll("#edTicketTable th").forEach((th) => {
    th.classList.toggle("sorted", th.dataset.sort === edTicketSort.key);
  });
}

function edBindTableSort(state) {
  document.querySelectorAll("#edTicketTable th[data-sort]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.sort;
      if (edTicketSort.key === key) {
        edTicketSort.dir = edTicketSort.dir === "asc" ? "desc" : "asc";
      } else {
        edTicketSort = { key, dir: "desc" };
      }
      edRenderTicketTable(Portfolio.get() || state);
    };
  });
}

/* ---------- boot ---------- */
Portfolio.ensure("advanced");
edRenderPrehled();
