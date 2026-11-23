/* Fundly — vývoj kurzu (graf v detailu zápasu) + sledované zápasy s upozorněním na pohyb kurzu.
 *
 * Data: tabulka odds_history (migrace 042; zapisují ji edge funkce odds-feed pre-match a
 * odds-stream živě) a live_odds (migrace 038). Jen PostgREST GET na Supabase — ŽÁDNÉ
 * požadavky na odds-api (hodinová kvóta je sdílená všemi hráči).
 *   - graf: jeden GET při otevření detailu (cache 3 min), poslední bod = aktuální kurz ze seznamu
 *   - hlídání: každých 60 s; zápasy z načteného seznamu bez požadavku, ostatní 1× live_odds
 *     (živé) + 1× odds_history (pre-match / bez živého řádku)
 *
 * Napojení na js/dashboard.js (globální funkce/proměnné, okomentované háčky):
 *   matchRowHtml → FundlyOddsWatch.starHtml(m) + rowClass(m)
 *   renderMatchDetail → FundlyOddsWatch.mountDetail(m)
 *   visibleEvents → filters.watched (chip #qWatched v dashboard.html)
 * Používá: sportEvents, filters, activeSport, detailMatch, renderMatches, showToast, uiLocale
 * (dashboard.js), fetchLiveOdds, configReady (portfolio.js), FUNDLY_SUPABASE_* (config.js).
 */
(function () {
  "use strict";

  const KEY = "fundly:watchlist";
  const MAX = 30;
  const STEP_PCT = 8; // upozornění při každém dalším 8% kroku od kurzu v okamžiku označení
  const CHECK_MS = 60 * 1000;
  const HIST_CACHE_MS = 3 * 60 * 1000;
  const PREMATCH_WINDOW_MS = 48 * 3600 * 1000;
  const MIN_SPAN_MS = 5 * 60 * 1000;
  const HOUR = 3600 * 1000;

  // ---------- i18n (namespace "ow") ----------
  if (typeof FUNDLY_I18N !== "undefined" && FUNDLY_I18N.extend) {
    FUNDLY_I18N.extend("en", { ow: {
      watch: "Watch", watching: "Watching", watched: "Watched",
      watchAria: "Watch this match", unwatchAria: "Stop watching this match",
      fullTitle: "Watchlist is full", fullBody: "You can watch up to {n} matches. Remove one first.",
      addedTitle: "Match added to Watched", addedBody: "We'll let you know here when its odds move by 8 % or more.",
      chartTitle: "Odds movement", range48: "last 48 h", rangeLive: "since kick-off",
      collecting: "Odds history is still being collected", loading: "Loading odds history…",
      failed: "Odds history is unavailable right now.",
      openNow: "Opening → now", now: "now", kickoff: "kick-off", draw: "Draw",
      alertTitle: "Odds moved: {match}", alertLine: "{pick}: {from} → {to} ({pct})",
      trendUp: "Odds rising (24 h ago {from})", trendDown: "Odds falling (24 h ago {from})",
    } });
    FUNDLY_I18N.extend("cs", { ow: {
      watch: "Sledovat", watching: "Sledováno", watched: "Sledované",
      watchAria: "Sledovat tento zápas", unwatchAria: "Přestat sledovat tento zápas",
      fullTitle: "Seznam sledovaných je plný", fullBody: "Sledovat můžeš nejvýš {n} zápasů. Nejdřív nějaký odeber.",
      addedTitle: "Zápas přidán do Sledovaných", addedBody: "Když se jeho kurz pohne o 8 % a víc, dáme ti tady vědět.",
      chartTitle: "Vývoj kurzu", range48: "posledních 48 h", rangeLive: "od začátku zápasu",
      collecting: "Historie kurzu se teprve sbírá", loading: "Načítám historii kurzu…",
      failed: "Historie kurzu teď není dostupná.",
      openNow: "Otevírací → teď", now: "teď", kickoff: "začátek", draw: "Remíza",
      alertTitle: "Kurz se pohnul: {match}", alertLine: "{pick}: {from} → {to} ({pct})",
      trendUp: "Kurz roste (před 24 h {from})", trendDown: "Kurz klesá (před 24 h {from})",
    } });
  }
  function tr(k, vars) {
    const key = "ow." + k;
    const fn = typeof window.tf === "function" ? window.tf : null;
    const v = fn ? fn(key, vars) : key;
    return v && v !== key ? v : k;
  }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const locale = () => (typeof uiLocale === "function" ? uiLocale() : "en-US");
  const num = (v) => { const n = typeof v === "number" ? v : parseFloat(v); return Number.isFinite(n) && n > 1 ? n : null; };
  // [home, draw, away] — null, když chybí 1 nebo 2 (trh stažený)
  function validOdds(arr) {
    if (!Array.isArray(arr)) return null;
    const v = [num(arr[0]), num(arr[1]), num(arr[2])];
    return v[0] && v[2] ? v : null;
  }
  const pickLbl = (i, twoWay) => (twoWay ? (i === 0 ? "1" : "2") : ["1", "X", "2"][i]);
  const fmtPct = (p) => (p > 0 ? "+" : p < 0 ? "−" : "") + Math.abs(p).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %";
  // globály z dashboard.js — skript se načítá před ním, takže jen za běhu a opatrně
  function loadedEvents() { try { return Array.isArray(sportEvents) ? sportEvents : []; } catch (e) { return []; } }
  function getFilters() { try { return filters; } catch (e) { return null; } }
  function rerender() { try { renderMatches(); } catch (e) { /* dashboard ještě není načtený */ } }
  const currentMatch = (id) => loadedEvents().find((m) => String(m.id) === String(id)) || null;
  function backendOk() {
    return typeof FUNDLY_SUPABASE_URL !== "undefined" && typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled();
  }
  async function restGet(table, params) {
    if (typeof configReady === "function") await configReady();
    if (!backendOk()) throw new Error("backend disabled");
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/rest/v1/${table}?${new URLSearchParams(params)}`, {
      headers: { apikey: FUNDLY_SUPABASE_ANON_KEY, Authorization: `Bearer ${FUNDLY_SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error(`${table} HTTP ${res.status}`);
    return res.json();
  }
  // historie jen pro zápasy z odds-api (číselné id) — vlastní zápasy (bookmaker "Fundly") ji nemají
  const chartable = (m) => /^\d{1,15}$/.test(String(m.id)) && m.bookmaker && m.bookmaker !== "Fundly";

  // ---------- watchlist (localStorage) ----------
  // { id, sport, home, away, date, bm, base:[h,d,a], cur:[h,d,a], at, hts, steps:[[up,down]×3], alert, liveAt }
  function load() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(a) ? a.filter((e) => e && e.id && Array.isArray(e.base)).slice(0, MAX) : [];
    } catch (e) { return []; }
  }
  let list = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch (e) { /* plné / zakázané úložiště */ } }
  const find = (id) => list.find((e) => e.id === String(id)) || null;
  const isWatched = (id) => !!find(id);

  const STAR_SVG = `<svg class="ow-star-ic" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17.1 6.6 20l1-6.1-4.4-4.3 6.1-.9z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  function starAttrs(id) {
    const on = isWatched(id);
    const lbl = esc(on ? tr("unwatchAria") : tr("watchAria"));
    return `data-ow-id="${esc(id)}" aria-pressed="${on}" aria-label="${lbl}" title="${lbl}"`;
  }
  // háček z matchRowHtml (řádek seznamu) — je v HTML řádku, takže přežije každé překreslení
  function starHtml(m) {
    return `<button type="button" class="ow-star" ${starAttrs(m.id)}>${STAR_SVG}</button>`;
  }
  function rowClass(m) {
    const e = find(m.id);
    return e ? (e.alert ? " ow-watched ow-alerted" : " ow-watched") : "";
  }
  function detailStarHtml(m) {
    return `<button type="button" class="filter-chip ow-star ow-star-chip" ${starAttrs(m.id)}>${STAR_SVG}<span class="ow-star-txt">${esc(isWatched(m.id) ? tr("watching") : tr("watch"))}</span></button>`;
  }

  // po změně: hvězdičky, zvýraznění řádku, počet na chipu — bez překreslení seznamu
  function syncDom(id) {
    const sel = id == null ? ".ow-star" : `.ow-star[data-ow-id="${CSS.escape(String(id))}"]`;
    document.querySelectorAll(sel).forEach((b) => {
      const on = isWatched(b.dataset.owId);
      const lbl = on ? tr("unwatchAria") : tr("watchAria");
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", lbl);
      b.title = lbl;
      const txt = b.querySelector(".ow-star-txt");
      if (txt) txt.textContent = on ? tr("watching") : tr("watch");
    });
    document.querySelectorAll(id == null ? ".match[data-match]" : `.match[data-match="${CSS.escape(String(id))}"]`).forEach((row) => {
      const e = find(row.dataset.match);
      row.classList.toggle("ow-watched", !!e);
      row.classList.toggle("ow-alerted", !!(e && e.alert));
    });
    const cnt = document.getElementById("qWatchedCount");
    if (cnt) { cnt.textContent = list.length ? String(list.length) : ""; cnt.hidden = !list.length; }
  }

  // krátké oznámení BEZ zápisu do zvonečku (plný seznam, přidání) — upozornění na pohyb jde přes showToast
  function flash(title, detail) {
    const layer = document.getElementById("toastLayer");
    if (!layer) return;
    const el = document.createElement("div");
    el.className = "toast toast-push";
    el.innerHTML = `<div class="toast-title">${esc(title)}</div>${detail ? `<div class="toast-detail">${esc(detail)}</div>` : ""}`;
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add("in"));
    setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 3500);
  }

  function toggle(id) {
    id = String(id);
    const i = list.findIndex((e) => e.id === id);
    if (i >= 0) {
      list.splice(i, 1);
    } else {
      const m = currentMatch(id);
      const odds = m && validOdds(m.odds);
      if (!m) return;
      if (list.length >= MAX) { flash(tr("fullTitle"), tr("fullBody", { n: MAX })); return; }
      const nowIso = new Date().toISOString();
      let sport = "";
      try { sport = activeSport; } catch (e) { /* */ }
      list.push({
        id, sport, home: m.home, away: m.away, date: m.date, bm: m.bookmaker,
        base: odds || [null, null, null], cur: odds || [null, null, null], at: nowIso, hts: nowIso,
        steps: [[0, 0], [0, 0], [0, 0]], alert: false, liveAt: m.live ? Date.now() : 0,
      });
      if (list.length === 1) flash(tr("addedTitle"), tr("addedBody"));
    }
    save();
    syncDom(id);
    const f = getFilters();
    if (f && f.watched) rerender(); // filtr "Sledované": odebraný zápas zmizí
  }

  // ---------- historie kurzu + graf ----------
  const histCache = new Map(); // "id|bookie" → { t, rows, err }
  const histInflight = new Set();
  async function loadHistory(id, bm) {
    // celá uložená historie (retence 7 dní, řádky jen při změně) — okno 48 h / od začátku se
    // ořízne až tady, aby byl známý i kurz platný na začátku okna (= otevírací kurz grafu)
    const rows = await restGet("odds_history", {
      select: "ts,home,draw,away", event_id: "eq." + id, bookie: "eq." + bm, order: "ts.desc", limit: "1500",
    });
    return Array.isArray(rows) ? rows.reverse() : [];
  }

  // body grafu: okno 48 h (pre-match) / od začátku zápasu (živě); poslední bod = aktuální kurz
  function buildSeries(rows, m, now) {
    now = now || Date.now();
    const live = !!m.live;
    const start = live ? Math.min(Date.parse(m.date) || now, now - MIN_SPAN_MS) : now - PREMATCH_WINDOW_MS;
    const pts = (rows || [])
      .map((r) => ({ t: Date.parse(r.ts), v: validOdds([r.home, r.draw, r.away]) }))
      .filter((p) => p.t && p.v && p.t <= now)
      .sort((a, b) => a.t - b.t);
    const cur = validOdds(m.odds);
    if (cur) pts.push({ t: now, v: cur });
    let i0 = -1;
    for (let i = 0; i < pts.length; i++) if (pts[i].t <= start) i0 = i;
    const out = i0 >= 0 ? [{ t: start, v: pts[i0].v }, ...pts.slice(i0 + 1)] : pts;
    if (out.length < 2 || out[out.length - 1].t - out[0].t < MIN_SPAN_MS) return { collecting: true };
    return { pts: out, t0: out[0].t, t1: out[out.length - 1].t, live, clipped: i0 >= 0 };
  }

  // "pěkný" krok osy v % (0 je vždy vidět)
  function pctStep(span) {
    for (const s of [1, 2, 5, 10, 20, 25, 50, 100]) if (span / s <= 4) return s;
    return 200;
  }

  // SVG: % změna od otevíracího kurzu (všechny 3 linie začínají na 0 → pohyb je hned vidět,
  // i když je 1 za 1.20 a 2 za 9.00); popisky na koncích = aktuální kurz. Bez tooltipu.
  function chartHtml(s, width, m) {
    const twoWay = !s.pts.some((p) => p.v[1]);
    const W = Math.max(260, Math.round(width || 320));
    const H = W < 480 ? 150 : 170;
    const padL = 40, padR = 70, padT = 10, padB = 22;
    const pw = W - padL - padR, ph = H - padT - padB;
    const open = s.pts[0].v, last = s.pts[s.pts.length - 1].v;
    const idx = [0, 1, 2].filter((i) => open[i] && last[i]);
    const pct = (i, p) => (p.v[i] ? (p.v[i] / open[i] - 1) * 100 : null);
    let lo = -4, hi = 4;
    for (const p of s.pts) for (const i of idx) { const v = pct(i, p); if (v !== null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    const x = (t) => padL + ((t - s.t0) / Math.max(1, s.t1 - s.t0)) * pw;
    const y = (v) => padT + ((hi - v) / (hi - lo)) * ph;
    const f1 = (n) => n.toFixed(1);

    // mřížka + osa Y
    const step = pctStep(hi - lo);
    let grid = "";
    for (let g = Math.ceil(lo / step) * step; g <= hi; g += step) {
      const gy = f1(y(g));
      grid += `<line class="${g === 0 ? "ow-zero" : "ow-grid"}" x1="${padL}" x2="${padL + pw}" y1="${gy}" y2="${gy}"/>` +
        `<text class="ow-ax" x="${padL - 6}" y="${gy}" dy="3.5" text-anchor="end">${g > 0 ? "+" : g < 0 ? "−" : ""}${Math.abs(g)} %</text>`;
    }
    // linie: schodovitě (kurz platí, dokud se nezmění)
    const lines = idx.map((i) => {
      let d = "", pen = false, py = 0;
      for (const p of s.pts) {
        const v = pct(i, p);
        if (v === null) { pen = false; continue; }
        const px = f1(x(p.t)), ny = f1(y(v));
        if (!pen) { d += `M${px} ${ny}`; pen = true; } else { d += `H${px}` + (ny !== py ? `V${ny}` : ""); }
        py = ny;
      }
      return `<path class="ow-l ow-l-${i}" d="${d}"/>`;
    }).join("");
    // koncové popisky: aktuální kurz, rozestoupené, ať se nepřekrývají
    const ends = idx.map((i) => ({ i, y: y((last[i] / open[i] - 1) * 100) })).sort((a, b) => a.y - b.y);
    const GAP = 14;
    for (let k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < GAP) ends[k].ly = (ends[k - 1].ly ?? ends[k - 1].y) + GAP;
    ends.forEach((e) => { e.ly = e.ly ?? e.y; });
    const over = ends.length ? ends[ends.length - 1].ly - (padT + ph) : 0;
    if (over > 0) ends.forEach((e) => { e.ly -= over; });
    const ex = padL + pw;
    const endLbl = ends.map((e) =>
      `<circle class="ow-dot ow-d-${e.i}" cx="${f1(ex)}" cy="${f1(e.y)}" r="3.5"/>` +
      `<text class="ow-end" x="${f1(ex + 8)}" y="${f1(e.ly)}" dy="3.5"><tspan class="ow-end-k">${pickLbl(e.i, twoWay)}</tspan> ${last[e.i].toFixed(2)}</text>`).join("");
    // osa X: začátek okna / teď
    const d0 = new Date(s.t0);
    const startTxt = s.live && !s.clipped
      ? d0.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
      : s.live
        ? `${tr("kickoff")} ${d0.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}`
        : d0.toLocaleString(locale(), { weekday: "short", hour: "2-digit", minute: "2-digit" });
    const xAx = `<text class="ow-ax" x="${padL}" y="${H - 6}">${esc(startTxt)}</text>` +
      `<text class="ow-ax" x="${padL + pw}" y="${H - 6}" text-anchor="end">${esc(tr("now"))}</text>`;

    const names = [m.home, tr("draw"), m.away];
    const legend = idx.map((i) => {
      const ch = (last[i] / open[i] - 1) * 100;
      const arrow = Math.abs(ch) < 0.05 ? "" : ch > 0 ? "▲ " : "▼ ";
      return `<div class="ow-lg-row">
        <span class="ow-sw ow-sw-${i}" aria-hidden="true"></span>
        <span class="ow-lg-name"><b>${pickLbl(i, twoWay)}</b> ${esc(names[i])}</span>
        <span class="ow-lg-val">${open[i].toFixed(2)} → <b>${last[i].toFixed(2)}</b></span>
        <span class="ow-lg-chg">${arrow}${fmtPct(Math.abs(ch) < 0.05 ? 0 : ch)}</span>
      </div>`;
    }).join("");
    const summary = idx.map((i) => `${pickLbl(i, twoWay)} ${open[i].toFixed(2)} → ${last[i].toFixed(2)}`).join(", ");

    return `<svg class="ow-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${tr("chartTitle")}: ${summary}`)}">
      ${grid}${lines}${endLbl}${xAx}
    </svg>
    <div class="ow-legend"><div class="ow-lg-head"><span></span><span></span><span>${esc(tr("openNow"))}</span><span></span></div>${legend}</div>`;
  }

  function chartBoxHtml(m, inner) {
    return `<div class="ow-chart-head"><b>${esc(tr("chartTitle"))}</b><span>${esc(m.live ? tr("rangeLive") : tr("range48"))} · ${esc(m.bookmaker)}</span></div>${inner}`;
  }

  function paintChart(m) {
    const box = document.querySelector(`[data-ow-chart="${CSS.escape(String(m.id))}"]`);
    if (!box) return;
    const key = `${m.id}|${m.bookmaker}`;
    const c = histCache.get(key);
    let inner;
    if (c && c.rows) {
      const s = buildSeries(c.rows, m);
      const w = box.querySelector(".ow-plot")?.clientWidth || box.clientWidth - 32;
      inner = s.collecting ? `<p class="ow-msg">${esc(tr("collecting"))}</p>` : chartHtml(s, w, m);
    } else if (c && c.err) {
      inner = `<p class="ow-msg">${esc(tr("failed"))}</p>`;
    } else {
      inner = `<p class="ow-msg ow-loading">${esc(tr("loading"))}</p>`;
    }
    box.innerHTML = chartBoxHtml(m, `<div class="ow-plot">${inner}</div>`);
    if ((!c || Date.now() - c.t > HIST_CACHE_MS) && !histInflight.has(key)) {
      histInflight.add(key);
      loadHistory(m.id, m.bookmaker)
        .then((rows) => histCache.set(key, { t: Date.now(), rows }))
        .catch(() => histCache.set(key, { t: Date.now(), rows: c && c.rows, err: true }))
        .finally(() => {
          histInflight.delete(key);
          if (histCache.size > 40) histCache.delete(histCache.keys().next().value);
          paintChart(currentMatch(m.id) || m);
        });
    }
  }

  // háček z renderMatchDetail (po vykreslení): hvězdička "Sledovat" + graf pod hlavičkou
  function mountDetail(m) {
    const root = document.getElementById("matchList");
    if (!root || !m) return;
    const bar = root.querySelector(".detail-bar");
    if (bar && !bar.querySelector(".ow-star")) bar.insertAdjacentHTML("beforeend", detailStarHtml(m));
    const e = find(m.id);
    if (e && e.alert) { e.alert = false; save(); } // otevřením detailu hráč upozornění viděl
    const head = root.querySelector(".detail-head");
    if (!head || !chartable(m) || root.querySelector("[data-ow-chart]")) return;
    head.insertAdjacentHTML("afterend", `<section class="ow-chart" data-ow-chart="${esc(m.id)}"></section>`);
    paintChart(m);
  }

  // ---------- hlídání pohybu kurzu (každých 60 s, jen s otevřeným dashboardem) ----------
  let checking = false;
  async function check() {
    if (checking || !list.length || document.hidden) return;
    checking = true;
    try {
      const now = Date.now();
      const loaded = new Map(loadedEvents().map((m) => [String(m.id), m]));
      const viaLive = [], viaHist = [];
      for (const e of list) {
        const m = loaded.get(e.id);
        if (m) { // načtený seznam (živě ho pollLiveOdds průběžně aktualizuje) — bez požadavku
          if (m.live) e.liveAt = now;
          const v = validOdds(m.odds);
          if (v && m.bookmaker !== e.bm) { // jiný bookmaker = jiná výchozí hodnota → začít znovu
            e.bm = m.bookmaker; e.base = v; e.steps = [[0, 0], [0, 0], [0, 0]];
          }
          if (v) e.cur = v;
          continue;
        }
        if (!/^\d{1,15}$/.test(e.id)) continue;
        (Date.parse(e.date) <= now ? viaLive : viaHist).push(e);
      }
      if (viaLive.length && typeof fetchLiveOdds === "function") {
        const rows = await fetchLiveOdds(viaLive.map((e) => e.id), null, false).catch(() => null);
        for (const e of viaLive) {
          const r = rows && rows.find((x) => String(x.event_id) === e.id && x.bookie === e.bm);
          const v = r && r.ml ? validOdds([r.ml.home, r.ml.draw, r.ml.away]) : null;
          if (r) e.liveAt = now; // řádek v live_odds = zápas běží (po konci ho relé smaže)
          if (v) e.cur = v; else viaHist.push(e);
        }
      }
      if (viaHist.length && backendOk()) {
        // jen řádky novější než poslední zpracovaný (u každého zápasu hts) — malé odpovědi
        const since = new Date(Math.min(...viaHist.map((e) => Date.parse(e.hts) || now))).toISOString();
        const rows = await restGet("odds_history", {
          select: "event_id,bookie,ts,home,draw,away",
          event_id: "in.(" + viaHist.map((e) => e.id).join(",") + ")",
          ts: "gt." + since, order: "ts.desc", limit: "1000",
        }).catch(() => null);
        if (Array.isArray(rows)) for (const e of viaHist) {
          const r = rows.find((x) => String(x.event_id) === e.id && x.bookie === e.bm && Date.parse(x.ts) > (Date.parse(e.hts) || 0));
          const v = r && validOdds([r.home, r.draw, r.away]);
          if (r) e.hts = new Date(Date.parse(r.ts)).toISOString();
          if (v) e.cur = v;
        }
      }

      // vyhodnocení: každý další 8% krok nahoru / dolů u každého výsledku = jedno upozornění
      for (const e of list) {
        if (!e.base || !e.cur) continue;
        if (!validOdds(e.base) && validOdds(e.cur)) { e.base = e.cur.slice(); continue; } // označeno bez kurzu
        const twoWay = !e.base[1];
        const lines = [];
        for (let i = 0; i < 3; i++) {
          const b = num(e.base[i]), c = num(e.cur[i]);
          if (!b || !c) continue;
          const p = (c / b - 1) * 100;
          const k = Math.floor(Math.abs(p) / STEP_PCT + 1e-9);
          const dir = p >= 0 ? 0 : 1;
          if (!e.steps[i]) e.steps[i] = [0, 0];
          if (k >= 1 && k > (e.steps[i][dir] || 0)) {
            e.steps[i][dir] = k;
            const pick = i === 1 ? `X ${tr("draw")}` : `${pickLbl(i, twoWay)} ${i === 0 ? e.home : e.away}`;
            lines.push(tr("alertLine", { pick: esc(pick), from: b.toFixed(2), to: c.toFixed(2), pct: fmtPct(p) }));
          }
        }
        if (lines.length) {
          e.alert = true;
          const title = tr("alertTitle", { match: esc(`${e.home} – ${e.away}`) });
          if (typeof showToast === "function") showToast("pend", title, lines.join("<br>"));
        }
      }

      // skončené zápasy pryč: 3 h po začátku a 15 min bez známky živého průběhu, nebo 12 h po začátku
      const before = list.length;
      list = list.filter((e) => {
        const t0 = Date.parse(e.date);
        if (!t0) return true;
        return !(now > t0 + 12 * HOUR || (now > t0 + 3 * HOUR && now - (e.liveAt || 0) > 15 * 60 * 1000));
      });
      save();
      syncDom(null);
      const f = getFilters();
      if (before !== list.length && f && f.watched) rerender();
      // otevřený detail: poslední bod grafu = aktuální kurz (bez nového požadavku)
      let open = null;
      try { open = detailMatch; } catch (e) { /* */ }
      if (open) { const m = currentMatch(open); if (m) paintChart(m); }
    } finally {
      checking = false;
    }
  }

  // ---------- trend kurzu v seznamu (šipky ↗ ↘ jako u Tipsportu) ----------
  // Referenční kurz = nejstarší uložený kurz za posledních 24 h (odds_history ukládá řádek jen
  // při změně). Jen hlavní trh ML zápasů z odds-api — historie jiných trhů se neukládá.
  const TREND_WINDOW_MS = 24 * 3600 * 1000;
  const trendRef = new Map(); // "id|bookie" → [h, d, a]
  const trendAsked = new Set(); // id, pro která už dotaz proběhl (i bez výsledku)
  let trendBusy = false;
  async function ensureTrends(events) {
    if (trendBusy || !backendOk()) return;
    const ids = (events || []).filter((m) => chartable(m) && (m.main || "ML") === "ML" && !trendAsked.has(String(m.id))).map((m) => String(m.id));
    if (!ids.length) return;
    trendBusy = true;
    let got = false;
    try {
      const since = new Date(Date.now() - TREND_WINDOW_MS).toISOString();
      for (let i = 0; i < ids.length; i += 60) {
        const chunk = ids.slice(i, i + 60);
        chunk.forEach((id) => trendAsked.add(id));
        const rows = await restGet("odds_history", {
          select: "event_id,bookie,home,draw,away", event_id: `in.(${chunk.join(",")})`, ts: "gte." + since, order: "ts.asc", limit: "4000",
        }).catch(() => []);
        for (const r of Array.isArray(rows) ? rows : []) {
          const k = `${r.event_id}|${r.bookie}`;
          if (trendRef.has(k)) continue; // první (nejstarší) řádek v okně
          const v = validOdds([r.home, r.draw, r.away]);
          if (v) { trendRef.set(k, v); got = true; }
        }
      }
    } finally {
      trendBusy = false;
    }
    if (got) rerender();
  }
  // -1 / 0 / 1 pro kurz i (0 = 1, 1 = X, 2 = 2) proti referenci
  function trendDir(m, i) {
    if (!m || (m.main || "ML") !== "ML") return 0;
    const ref = trendRef.get(`${m.id}|${m.bookmaker}`);
    const cur = m.odds && m.odds[i];
    if (!ref || !ref[i] || !cur) return 0;
    const d = cur - ref[i];
    return Math.abs(d) < 0.01 ? 0 : d > 0 ? 1 : -1;
  }
  function trendHtml(m, i) {
    const d = trendDir(m, i);
    if (!d) return "";
    const ref = trendRef.get(`${m.id}|${m.bookmaker}`)[i];
    const t = esc(tr(d > 0 ? "trendUp" : "trendDown", { from: ref.toFixed(2) }));
    return `<i class="odd-tr ${d > 0 ? "up" : "down"}" title="${t}" aria-label="${t}">${d > 0 ? "↗" : "↘"}</i>`;
  }
  function trendFrom(m, i) {
    const d = trendDir(m, i);
    return d ? trendRef.get(`${m.id}|${m.bookmaker}`)[i] : null;
  }

  // ---------- napojení na DOM ----------
  function init() {
    const ml = document.getElementById("matchList");
    if (ml) {
      // capture: hvězdička je uvnitř .match-head (role=button) — klik nesmí otevřít detail
      ml.addEventListener("click", (e) => {
        const star = e.target.closest(".ow-star");
        if (!star) return;
        e.stopPropagation();
        e.preventDefault();
        toggle(star.dataset.owId);
      }, true);
      ml.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target.closest(".ow-star")) e.stopPropagation(); // nativní klik tlačítka
      }, true);
    }
    const chip = document.getElementById("qWatched");
    if (chip) {
      chip.addEventListener("click", () => {
        const f = getFilters();
        if (!f) return;
        f.watched = !f.watched;
        chip.setAttribute("aria-pressed", String(f.watched));
        rerender();
      });
    }
    // statické texty chipu: i18n.js je přeložil dřív, než se načetl slovník "ow"
    document.querySelectorAll('[data-i18n^="ow."]').forEach((el) => { el.textContent = tr(el.getAttribute("data-i18n").slice(3)); });
    syncDom(null);
    // jiná karta změnila seznam
    window.addEventListener("storage", (e) => { if (e.key === KEY) { list = load(); syncDom(null); } });
    let rt = 0;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const box = document.querySelector("[data-ow-chart]");
        const m = box && currentMatch(box.dataset.owChart);
        if (m) paintChart(m);
      }, 200);
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
    setInterval(check, CHECK_MS);
    setTimeout(check, 8000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.FundlyOddsWatch = { starHtml, rowClass, mountDetail, isWatched, toggle, check, ensureTrends, trendHtml, trendDir, trendFrom, _buildSeries: buildSeries, _chartHtml: chartHtml };
})();
