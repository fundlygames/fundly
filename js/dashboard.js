/* Betflow dashboard — přepínání sekcí, sázení, žebříček, profil */

const czk = (n) => n.toLocaleString("cs-CZ") + " Kč";

// ---------- přepínání sekcí ----------
const views = ["prehled", "vykon", "sazeni", "zebricek", "vyplaty", "profil"];

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
}

document.addEventListener("click", (e) => {
  const nav = e.target.closest("[data-view]");
  if (nav) { showView(nav.dataset.view); return; }
  const link = e.target.closest("[data-view-link]");
  if (link) showView(link.dataset.viewLink);
});

// ---------- přehled: pod-taby ----------
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

// ---------- portfolio: nastartuje simulaci a průběžně vyhodnocuje tikety ----------
Portfolio.ensure("advanced");
async function refreshAfterSettlement() {
  await Portfolio.checkSettlements();
  if (typeof renderPrehled === "function") renderPrehled();
  if (typeof renderVykon === "function") renderVykon();
  if (typeof renderBankBar === "function") renderBankBar();
}
refreshAfterSettlement();
setInterval(refreshAfterSettlement, 5 * 60 * 1000);

// ---------- sázení (živá data z odds-api.io) ----------
// API_BASE/API_KEY/BOOKMAKER/CACHE_TTL/cacheGet/cacheSet/cacheDrop/apiGet: viz js/portfolio.js
const ODDS_MIN = 1.0;
const ODDS_MAX = 8.0;
const EVENTS_PER_SPORT = 10; // /odds/multi bere max 10 eventů na 1 request

// sporty jako na původním dashboardu
const SPORTS = [
  ["basketball", "Basketbal", "basketbal"],
  ["football", "Fotbal", "fotbal"],
  ["ice-hockey", "Hokej", "hokej"],
  ["table-tennis", "Stolní tenis", "stolni-tenis"],
  ["tennis", "Tenis", "tenis"],
];

let activeSport = "basketball";
let slip = []; // {id, match, pick, odds}
let sportEvents = []; // načtené zápasy aktivního sportu
const filters = { q: "", date: "", league: "", odds: "", live: false, high: false };

const sportTabs = document.getElementById("sportTabs");
const matchList = document.getElementById("matchList");
const slipBody = document.getElementById("slipBody");

// eventy + ML kurzy, 2 requesty na sport, cache 5 min (LIVE 1 min)
async function loadSportEvents(sport, live) {
  const key = live ? sport + ":live" : sport;
  const cached = cacheGet(key, live ? 60 * 1000 : CACHE_TTL);
  if (cached) return cached;

  const events = live
    ? await apiGet("/events/live", { sport })
    : await apiGet("/events", { sport, status: "pending", limit: String(EVENTS_PER_SPORT) });
  if (!events.length) { cacheSet(key, []); return []; }

  const ids = events.map((e) => e.id).slice(0, 10).join(",");
  const withOdds = await apiGet("/odds/multi", { eventIds: ids, bookmakers: BOOKMAKER });

  const merged = withOdds
    .map((e) => {
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
        live: !!live,
        odds: [parseFloat(row.home), row.draw ? parseFloat(row.draw) : null, parseFloat(row.away)],
        markets: markets
          .filter((m) => Array.isArray(m.odds) && m.odds.length)
          .slice(0, 14), // všechny trhy pro detail zápasu
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  cacheSet(key, merged);
  return merged;
}

// překlady trhů a výběrů
const MARKET_LABELS = {
  "ML": "Vítěz zápasu",
  "Draw No Bet": "Remíza bez sázky",
  "Double Chance": "Dvojitá šance",
  "Spread": "Asijský handicap",
  "European Handicap": "Evropský handicap",
  "Totals": "Celkem bodů (více / méně)",
  "Goals Over/Under": "Góly (více / méně)",
  "Both Teams To Score": "Oba týmy skórují",
  "Spread HT": "Handicap · 1. poločas",
  "Totals HT": "Celkem · 1. poločas",
  "ML HT": "Vítěz · 1. poločas",
  "Corners": "Rohy",
  "Correct Score": "Přesný výsledek",
};
const PICK_LABELS = { home: "1", draw: "X", away: "2", over: "Více", under: "Méně", yes: "Ano", no: "Ne" };
const PICK_FIELDS = ["home", "draw", "away", "over", "under", "yes", "no"];

function marketLabel(name) { return MARKET_LABELS[name] || name; }

function oddPlayable(v) {
  const n = parseFloat(v);
  return !Number.isNaN(n) && n >= ODDS_MIN && n <= ODDS_MAX;
}

// naplní select lig podle načtených zápasů
function refreshLeagueOptions() {
  const sel = document.getElementById("fLeague");
  const current = filters.league;
  const leagues = [...new Set(sportEvents.map((m) => m.league).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">Všechny ligy</option>` +
    leagues.map((l) => `<option value="${l.replace(/"/g, "&quot;")}">${l}</option>`).join("");
  sel.value = leagues.includes(current) ? current : "";
  filters.league = sel.value;
}

function fmtTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const today = now.toDateString() === d.toDateString();
  const tomorrow = new Date(now.getTime() + 864e5).toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
  if (today) return `Dnes ${hm}`;
  if (tomorrow) return `Zítra ${hm}`;
  return `${d.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })} ${hm}`;
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
  if (filters.date) {
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

let detailMatch = null; // otevřený zápas (master -> detail)
let openGroups = null; // rozbalené trhy v detailu (drží se přes re-render)

// řádek s kurzy jednoho trhu (home/draw/away, over/under, yes/no…)
function marketRowButtons(m, marketName, row, ri) {
  const caption = row.label || (row.hdp !== undefined ? `Hranice ${row.hdp}` : "");
  const btns = PICK_FIELDS
    .filter((f) => row[f] !== undefined && row[f] !== null)
    .map((f) => {
      const val = parseFloat(row[f]);
      if (Number.isNaN(val)) return "";
      const id = `${m.id}|${marketName}|${ri}|${f}`;
      const sel = slip.some((s) => s.id === id);
      const out = !oddPlayable(val);
      const small = row.label ? "Kurz" : (PICK_LABELS[f] || f);
      return `<button class="odd-btn ${sel ? "selected" : ""}" data-pick="${id}"
        ${out ? `disabled title="Kurz mimo povolený rozsah ${ODDS_MIN.toFixed(2)} až ${ODDS_MAX.toFixed(2)}"` : ""}>
        <small>${small}</small><b>${val.toFixed(2)}</b>
      </button>`;
    }).join("");
  if (!btns) return "";
  return `<div class="mk-row">
    ${caption ? `<span class="mk-cap">${caption}</span>` : ""}
    <span class="mk-btns">${btns}</span>
  </div>`;
}

// zapne/vypne prvky seznamu, když je otevřený detail
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
        Zpět na zápasy
      </button>
    </div>
    <div class="detail-head">
      <div class="m-league">${m.league}</div>
      <div class="detail-teams">${m.home} <span>vs</span> ${m.away}</div>
      <div class="m-time">${m.live ? '<span class="live">● LIVE</span> · ' : ""}${fmtTime(m.date)} · ${m.markets.length} trhů</div>
    </div>
    <div class="mk-accs">${groups || `<p class="bet-msg">Další trhy nejsou k dispozici.</p>`}</div>`;

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
    matchList.innerHTML = `<p class="bet-msg">Žádné zápasy neodpovídají filtrům.<br />Zkuste jiný sport nebo zrušte filtry.</p>`;
    return;
  }
  matchList.innerHTML = list.map((m) => {
    const extra = m.markets.length - 1;
    return `
    <div class="match" data-match="${m.id}">
      <div class="match-head" role="button" tabindex="0" aria-label="Otevřít detail zápasu ${m.home} – ${m.away}">
        <div class="m-info">
          <div class="m-league">${m.league}</div>
          <div class="m-teams">${m.home} – ${m.away}</div>
          <div class="m-time">${m.live ? '<span class="live">● LIVE</span> · ' : ""}${fmtTime(m.date)}${extra > 0 ? ` · +${extra} trhů` : ""}</div>
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
              ${out ? `disabled title="Kurz mimo povolený rozsah ${ODDS_MIN.toFixed(2)} až ${ODDS_MAX.toFixed(2)}"` : ""}>
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

// vyhodnocení kliknutého picku podle id `eventId|market|rowIdx|field`
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
    ? "Vyčerpaný limit API požadavků. Zkuste to za chvíli."
    : "Zápasy se nepodařilo načíst.";
  matchList.innerHTML = `<p class="bet-msg">${msg}<br />
    <button class="btn btn-ghost" id="betRetry">Zkusit znovu</button></p>`;
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
    if (slug !== activeSport || live !== filters.live) return; // mezitím přepnuto jinam
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
  bal.textContent = czk(state.balance);
  document.getElementById("bankMaxStake").textContent = czk(state.maxStake);
  document.getElementById("bankOddsRange").textContent = `${ODDS_MIN.toFixed(2)} až ${ODDS_MAX.toFixed(2)}`;
}

function renderSlip() {
  if (!slip.length) {
    slipBody.innerHTML = `<p class="slip-empty"><img src="assets/fan-1.jpg" alt="" />Váš tiket je prázdný.<br />Vyberte si kurzy z nabídky.</p>`;
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
          <span class="si-pick">Tip: ${s.pick}</span>
        </span>
        <span class="si-odds">${s.odds.toFixed(2)}</span>
        <button class="si-x" data-remove="${s.id}" aria-label="Odebrat">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
      </div>`).join("")}
    <div class="slip-total"><span>Celkový kurz</span><b>${totalOdds.toFixed(2)}</b></div>
    <div class="field">
      <label for="stakeInput">Vklad (max. ${czk(maxStake)})</label>
      <input class="input" id="stakeInput" type="number" min="100" max="${maxStake}" value="${Math.min(2000, maxStake)}" />
    </div>
    <div class="slip-total"><span>Možná výhra</span><b class="green" id="potWin"></b></div>
    <button class="btn btn-primary" style="width:100%" id="placeBet">Vsadit</button>
    <p class="auth-note mt" id="betNote" hidden></p>`;

  const stakeInput = document.getElementById("stakeInput");
  const potWin = document.getElementById("potWin");
  const updateWin = () => {
    let v = Math.min(Number(stakeInput.value) || 0, maxStake);
    potWin.textContent = czk(Math.round(v * totalOdds));
  };
  stakeInput.addEventListener("input", updateWin);
  updateWin();

  document.getElementById("placeBet").addEventListener("click", () => {
    const note = document.getElementById("betNote");
    const btn = document.getElementById("placeBet");
    const result = Portfolio.placeBet(slip, Number(stakeInput.value));
    if (!result.ok) {
      note.textContent = result.error;
      note.hidden = false;
      return;
    }
    note.textContent = "Tiket přijat! Sledujte ho v Přehledu.";
    note.hidden = false;
    btn.disabled = true;
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
        // jeden výběr na zápas a trh+řádek: nahradí případný konfliktní pick
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

  // filtry
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
  });

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

// ---------- žebříček ----------
const LB = [
  { name: "Karolína S.", city: "Olomouc", profit: 48200, roi: 31, win: 74 },
  { name: "Petr H.", city: "Ostrava", profit: 41600, roi: 27, win: 69 },
  { name: "David P.", city: "Zlín", profit: 33900, roi: 24, win: 71 },
  { name: "Martin K.", city: "Praha", profit: 24800, roi: 19, win: 66 },
  { name: "Lukáš D.", city: "Liberec", profit: 17250, roi: 15, win: 63 },
  { name: "Jana N.", city: "Brno", profit: 12300, roi: 12, win: 61 },
  { name: "Tipér42", city: "Vy", profit: 6400, roi: 19, win: 67, me: true },
  { name: "Ondřej M.", city: "Hradec Králové", profit: 6100, roi: 9, win: 58 },
];

const PERIOD_SCALE = { tyden: 0.25, mesic: 1, celkem: 2.6 };
let lbPeriod = "mesic";
let lbMetric = "profit";

function renderLb() {
  const rows = [...LB]
    .map((r) => ({ ...r, profit: Math.round(r.profit * PERIOD_SCALE[lbPeriod]) }))
    .sort((a, b) => (lbMetric === "profit" ? b.profit - a.profit : lbMetric === "roi" ? b.roi - a.roi : b.win - a.win));
  const val = (r) =>
    lbMetric === "profit" ? "+" + czk(r.profit) : lbMetric === "roi" ? r.roi + " % ROI" : r.win + " %";
  document.getElementById("lbList").innerHTML = rows.map((r, i) => `
    <div class="lb-row ${r.me ? "me" : ""}">
      <span class="lb-rank">${i + 1}</span>
      <span class="pay2-av">${r.name.split(" ").map((w) => w[0]).join("").replace(".", "")}</span>
      <span class="lb-name">${r.name}${r.me ? " · vy" : ""}<small>${r.me ? "Elite · Fáze 1" : r.city}</small></span>
      <span class="lb-val">${val(r)}</span>
    </div>`).join("");
}

["lbPeriod", "lbMetric"].forEach((groupId) => {
  const group = document.getElementById(groupId);
  if (!group) return;
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    group.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
    if (btn.dataset.period) lbPeriod = btn.dataset.period;
    if (btn.dataset.metric) lbMetric = btn.dataset.metric;
    renderLb();
  });
});
if (document.getElementById("lbList")) renderLb();

// ---------- výplaty ----------
const wdForm = document.getElementById("wdForm");
if (wdForm) {
  wdForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const note = document.getElementById("wdNote");
    note.textContent = "Výběry se odemknou s financovaným účtem po dokončení obou fází.";
    note.hidden = false;
  });
}

// ---------- profil ----------
const BADGES = [
  ["První vítězství", "b-prvni-vitezstvi", true],
  ["5 v řadě", "b-5-v-rade", true],
  ["10 v řadě", "b-10-v-rade", false],
  ["Akumulátor expert", "b-akumulator", true],
  ["Fáze 1 dokončená", "b-faze-1", false],
  ["Fáze 2 dokončená", "b-faze-2", false],
  ["Funded hráč", "b-funded", false],
  ["100 sázek", "b-100-sazek", false],
  ["Lovecký instinkt", "b-lovecky", false],
  ["Železná ruka", "b-zelezna-ruka", false],
  ["První výběr", "b-prvni-vyber", false],
  ["Ambasador", "b-ambasador", false],
];

const badgeGrid = document.getElementById("badgeGrid");
if (badgeGrid) {
  badgeGrid.innerHTML = BADGES.map(([name, img, unlocked]) => `
    <div class="badge-tile ${unlocked ? "unlocked" : ""}" title="${name}">
      <img src="assets/badges/${img}.png" alt="" />${name}
    </div>`).join("");
}

const refCopy = document.getElementById("refCopy");
if (refCopy) {
  refCopy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(document.getElementById("refLink").value);
      refCopy.textContent = "Zkopírováno";
      setTimeout(() => (refCopy.textContent = "Kopírovat"), 1500);
    } catch (e) {
      document.getElementById("refLink").select();
    }
  });
}

const lbShare = document.getElementById("lbShare");
if (lbShare) {
  lbShare.addEventListener("click", () => {
    lbShare.setAttribute("aria-checked", String(lbShare.getAttribute("aria-checked") !== "true"));
  });
}

const nickSave = document.getElementById("nickSave");
if (nickSave) {
  nickSave.addEventListener("click", () => {
    nickSave.textContent = "Uloženo";
    setTimeout(() => (nickSave.textContent = "Uložit"), 1500);
  });
}

// ---------- přehled: render z reálného stavu portfolia ----------
function renderEquityChart(state) {
  const points = state.equityHistory;
  if (points.length < 2) {
    return `<p class="bet-msg">Graf se naplní, jakmile proběhne první vsazený a vyhodnocený tiket.</p>`;
  }
  const w = 600, h = 140, pad = 8;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) * (1 - (p.balance - min) / span);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = values[values.length - 1] >= values[0] ? "var(--accent)" : "#ff6b6b";
  return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="equity-svg" role="img" aria-label="Graf vývoje zůstatku">
      <polyline points="${coords.join(" ")}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
    <div class="equity-range"><span>${czk(min)}</span><span>${czk(max)}</span></div>`;
}

function renderRecentTickets(state) {
  const recent = state.tickets.slice(0, 5);
  if (!recent.length) {
    return `<p class="bet-msg">Zatím žádné tikety. Vsaďte první v sekci Sázení.</p>`;
  }
  return recent.map((t) => {
    const label = t.selections.length > 1
      ? `${t.selections.length}× akumulátor`
      : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`;
    const tag = t.status === "won" ? "win" : t.status === "lost" ? "loss" : t.status === "push" ? "push" : "pend";
    const tagText = t.status === "won" ? "Výhra" : t.status === "lost" ? "Prohra" : t.status === "push" ? "Vráceno" : "Čeká";
    return `<div class="k-row neutral">${label} · ${czk(t.stake)}<span class="n"><span class="tag ${tag}">${tagText}</span></span></div>`;
  }).join("");
}

function renderPrehled() {
  const view = document.getElementById("view-prehled");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  const phaseLabel = state.phase === "funded" ? "Financovaný účet" : `Fáze ${state.phase}`;
  document.getElementById("ovSubtitle").textContent = `${phaseLabel} · Betflow výzva`;
  document.getElementById("ovPhaseChip").textContent = phaseLabel;

  const target = Portfolio.phaseTarget(state);
  const profit = state.balance - state.phaseBaseline;
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((profit / target) * 100))) : 100;
  const toGoal = Math.max(0, target - profit);
  const daysLeft = Portfolio.daysRemaining(state);

  document.getElementById("balanceCard").innerHTML = `
    <div class="balance-top">
      <div>
        <div class="bc-plan">Balíček ${state.packageName}</div>
        <div class="bc-amount">${czk(state.balance)}</div>
        <div class="bc-sub">Aktuální zůstatek</div>
      </div>
      <span class="chip-phase">${state.profitSplit} % podíl</span>
    </div>
    ${state.phase === "funded" ? `
    <div class="bc-goal"><div class="bc-goal-row"><span>Financovaný účet</span><span><b>Neomezeno</b></span></div></div>
    ` : `
    <div class="bc-goal">
      <div class="bc-goal-row"><span>Cíl fáze: <b>${czk(state.phaseBaseline + target)}</b></span><span><b>${pct} %</b></span></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="bc-meta"><span>${daysLeft} dní zbývá</span><span>Do cíle ${czk(toGoal)}</span></div>
    </div>`}`;

  document.getElementById("equityChart").innerHTML = renderEquityChart(state);

  const s = Portfolio.summary(state);
  document.getElementById("ovStatGrid").innerHTML = `
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1.5 11.5l4-4 3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Zisk</div>
      <div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${czk(s.netProfit)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.6"/><circle cx="7" cy="7" r="2" fill="currentColor"/></svg>Do cíle</div>
      <div class="val">${state.phase === "funded" ? "—" : czk(toGoal)}</div>
    </div>
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M4.5 2h6v4a3 3 0 01-6 0V2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7.5 9v2.5M5 13h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>Výhry</div>
      <div class="val">${s.won} <small>/ ${s.won + s.lost}</small></div>
    </div>
    <div class="dstat">
      <div class="lbl"><svg width="13" height="13" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2 5a1.5 1.5 0 001.5-1.5h8A1.5 1.5 0 0013 5v1.6a1.9 1.9 0 000 3.8V12a1.5 1.5 0 00-1.5 1.5h-8A1.5 1.5 0 002 12V5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" transform="translate(0,-1.2)"/></svg>Tikety</div>
      <div class="val">${s.total}</div>
    </div>`;

  document.getElementById("recentTickets").innerHTML = renderRecentTickets(state);

  const dd = Portfolio.drawdownInfo(state);
  document.getElementById("ovLimity").innerHTML = `
    <div class="limit-row">
      <span class="k">Trailing drawdown <small>(HWM: ${czk(dd.hwm)})</small></span>
      <span class="v">${czk(Math.round(dd.remaining))} zbývá</span>
    </div>
    <div class="dd-bar">
      <span class="cap lo">Floor: ${dd.floor.toLocaleString("cs-CZ")}</span>
      <span class="cursor" style="left:${dd.pct}%"></span>
      <span class="cap hi">${state.balance.toLocaleString("cs-CZ")}</span>
    </div>`;

  document.getElementById("ovPravidla").innerHTML = `
    <div class="rules-grid">
      <div class="rule-tile"><div class="k">Profit split</div><div class="v green">${state.profitSplit} %</div></div>
      <div class="rule-tile"><div class="k">Max. sázka</div><div class="v">${czk(state.maxStake)}</div></div>
      <div class="rule-tile"><div class="k">Kurzy</div><div class="v">${ODDS_MIN.toFixed(2)} až ${ODDS_MAX.toFixed(2)}</div></div>
      <div class="rule-tile"><div class="k">Drawdown</div><div class="v">${czk(state.drawdown)}</div></div>
      <div class="rule-tile"><div class="k">Časový limit</div><div class="v">30 dní / fáze</div></div>
      <div class="rule-tile"><div class="k">Min. tiketů</div><div class="v">7</div></div>
    </div>`;

  const steps = [
    { title: "Fáze 1 · Betflow výzva", desc: `Cíl +${czk(state.target1)}`, img: "assets/card2-vyzva.jpg" },
    { title: "Fáze 2 · Verifikace", desc: `Cíl +${czk(state.target2)}`, img: "assets/card2-verifikace.jpg" },
    { title: "Financovaný účet", desc: `${state.profitSplit} % podíl na zisku, neomezený čas, pravidelné výplaty.`, img: "assets/card2-tiper.jpg" },
  ];
  const currentIndex = state.phase === "funded" ? 2 : state.phase - 1;
  document.getElementById("ovCesta").innerHTML = `<div class="journey">${steps.map((step, i) => {
    const cls = i < currentIndex ? "done" : i === currentIndex ? "now" : "";
    const dot = i < 2 ? String(i + 1) : "✓";
    const desc = i === currentIndex && state.phase !== "funded"
      ? `${step.desc}, právě probíhá. Máte ${pct} % splněno.`
      : step.desc;
    return `<div class="j-step ${cls}">
      <div class="j-dot-col"><span class="j-dot">${dot}</span>${i < steps.length - 1 ? '<span class="j-line"></span>' : ""}</div>
      <div class="j-body">
        <img class="j-thumb" src="${step.img}" alt="" />
        <span><span class="t">${step.title}</span><br /><span class="d">${desc}</span></span>
      </div>
    </div>`;
  }).join("")}</div>`;
}
renderPrehled();

// ---------- výkon: render z reálného stavu portfolia ----------
function renderVykon() {
  const view = document.getElementById("view-vykon");
  if (!view) return;
  const state = Portfolio.ensure("advanced");
  document.getElementById("vykonSubtitle").textContent = `Statistiky balíčku ${state.packageName}`;
  const s = Portfolio.summary(state);

  document.getElementById("vykonStatGrid").innerHTML = `
    <div class="dstat"><div class="lbl">Aktuální zisk</div><div class="val ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${czk(s.netProfit)}</div></div>
    <div class="dstat"><div class="lbl">Úspěšnost</div><div class="val ${s.winRate >= 50 ? "green" : ""}">${s.winRate} %</div></div>
    <div class="dstat"><div class="lbl">Průměrný kurz</div><div class="val">${s.avgOdds.toFixed(2)}</div></div>
    <div class="dstat"><div class="lbl">Čekající</div><div class="val">${s.pending}</div></div>`;

  document.getElementById("vykonBreakdown").innerHTML = `
    <div class="k-row win">Výherní<span class="n">${s.won}</span></div>
    <div class="k-row loss">Prohrané<span class="n">${s.lost}</span></div>
    <div class="k-row pend">Čekající<span class="n">${s.pending}</span></div>`;

  document.getElementById("vykonFinancials").innerHTML = `
    <div class="k-row neutral">Vsazeno<span class="n">${czk(s.staked)}</span></div>
    <div class="k-row neutral">Vráceno<span class="n">${czk(s.returned)}</span></div>
    <div class="k-row neutral">Čistý zisk<span class="n ${s.netProfit >= 0 ? "green" : ""}">${s.netProfit >= 0 ? "+" : ""}${czk(s.netProfit)}</span></div>`;

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
      ? `${t.selections.length}× akumulátor`
      : `${t.selections[0].homeTeam} – ${t.selections[0].awayTeam}`;
    const tip = t.selections.length > 1 ? "AKU" : (t.selections[0].pickLabel || "");
    const tag = t.status === "won" ? "win" : t.status === "lost" ? "loss" : t.status === "push" ? "push" : "pend";
    const tagText = t.status === "won" ? "Výhra" : t.status === "lost" ? "Prohra" : t.status === "push" ? "Vráceno" : "Čeká";
    return `<tr><td>${label}</td><td>${tip}</td><td class="odds">${t.combinedOdds.toFixed(2)}</td><td>${czk(t.stake)}</td><td><span class="tag ${tag}">${tagText}</span></td></tr>`;
  }).join("") : `<tr><td colspan="5">Zatím žádné tikety.</td></tr>`;
}
