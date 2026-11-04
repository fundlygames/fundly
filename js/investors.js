/* Fundly — stránka pro investory a tým (investors.html).
   Načte agregovaná čísla z edge funkce investor-stats (přístup jen s tajným odkazem ?k=…)
   a vykreslí je. Žádné osobní údaje ani interní věci z adminu — jen souhrny.
   Grafy jsou ruční SVG (bez knihoven). Jazyk: EN / SK. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- texts
  var T = {
    en: {
      tagline: "Investor dashboard", loading: "Loading…", refresh: "Refresh", hi: "Hi", updated: "Updated",
      heroTitle: "Fundly — business overview", heroText: "Live numbers for investors and the team: revenue, costs, profit, audience and players. Everything here is aggregated — no personal data.",
      s_headline: "Headline numbers", s_pl: "Profit & loss", s_growth: "Growth", s_funnel: "Conversion funnel & marketing efficiency", s_audience: "Audience", s_players: "Players", s_activity: "Platform activity", s_defs: "Definitions & notes",
      netProfit: "Net profit", grossRevenue: "Gross revenue", totalCosts: "Total costs", marketing: "Marketing spend", activePlayers: "Active players", registrations: "Registrations", visitors30: "Visitors (30 days)", customers: "Paying customers",
      vsPrev: "vs previous 30 days", allTime: "all time", sinceStart: "since launch",
      plGross: "Gross sales", plFees: "Payment processing fees", plNet: "Net revenue", plMarketing: "Marketing", plOther: "Other costs (software, payroll, legal…)", plPayouts: "Partner payouts", plProfit: "Net profit",
      plNetHint: "what actually reaches the bank", plPayoutsHint: "performance rewards paid to funded partners", margin: "Profit margin",
      monthly: "Monthly revenue vs. costs", revenue: "Revenue", costs: "Costs (incl. payouts)", profit: "Profit",
      regDaily: "New registrations per day", visDaily: "Visitors per day", days: "days", last: "Last",
      funnelVisitors: "Visitors", funnelCheckout: "Reached checkout", funnelRegistered: "Registered", funnelCustomers: "Paid", funnelPhase2: "Reached Phase 2", funnelFunded: "Funded partners",
      funnelNote: "Visitors, checkout visits, registrations and purchases are counted from the day visitor tracking started; the later steps are lifetime.",
      roas: "Return on ad spend (ROAS)", cac: "Cost per customer (CAC)", arpu: "Revenue per customer", aov: "Avg. order value", regToCust: "Registration → customer", visToReg: "Visitor → registration", repeat: "Repeat customers",
      trackingSince: "Visitor tracking is on since", trackingNone: "Visitor tracking was just switched on — numbers will appear as visitors arrive.",
      countries: "Visitors by country", custCountries: "Customers by billing country", sources: "Traffic sources", devices: "Devices", langs: "Site language",
      noData: "No data yet", orders: "orders", visitorsShort: "visitors",
      byState: "Accounts by status", byPackage: "Active players by package", active: "Active", closed: "Closed", cancelled: "Cancelled", pending_approval: "Awaiting phase approval", funded: "Funded partners",
      phaseRate: "Reached Phase 2", closedRate: "Accounts closed", leads: "E-mail leads", previews: "Preview accounts", waitlist: "Waitlist",
      tickets: "Tickets placed", tickets30: "Tickets (30 days)", volume: "Simulated volume", winRate: "Win rate", avgStake: "Avg. entry size", avgOdds: "Avg. odds", bettors: "Active players (30d)",
      ticketsDaily: "Tickets per day", topSports: "Most played sports",
      def1: "<b>Gross revenue</b> = all successful payments, converted to USD. <b>Net revenue</b> is what remains after payment-processing fees.",
      def2: "<b>Net profit</b> = net revenue − costs entered by the team (marketing, software, payroll, legal, other) − performance rewards paid to partners.",
      def3: "<b>Active players</b> = accounts that are active, awaiting approval or funded. Internal, demo and test accounts are excluded from every number.",
      def4: "<b>Visitors</b> are counted cookie-free (one per device per day); bots are filtered out. Countries come from the visitor's connection.",
      def5: "Costs are entered manually by the team in the admin area and are always up to date with the latest entry.",
      invalid: "This link is not valid", invalidText: "The access link is missing, wrong or has been revoked. Please ask the Fundly team for a new one.", failed: "Could not load the statistics", failedText: "Please try again in a moment.", retry: "Try again",
      other: "Other", direct: "direct", unknown: "Unknown", mobile: "Mobile", desktop: "Desktop", tablet: "Tablet",
    },
    sk: {
      tagline: "Dashboard pre investorov", loading: "Načítavam…", refresh: "Obnoviť", hi: "Ahoj", updated: "Aktualizované",
      heroTitle: "Fundly — prehľad podnikania", heroText: "Živé čísla pre investorov a tím: tržby, náklady, zisk, publikum a hráči. Všetko je len súhrnné — žiadne osobné údaje.",
      s_headline: "Hlavné čísla", s_pl: "Zisk a strata", s_growth: "Rast", s_funnel: "Konverzný lievik a efektivita marketingu", s_audience: "Publikum", s_players: "Hráči", s_activity: "Aktivita platformy", s_defs: "Definície a poznámky",
      netProfit: "Čistý zisk", grossRevenue: "Hrubé tržby", totalCosts: "Celkové náklady", marketing: "Výdavky na marketing", activePlayers: "Aktívni hráči", registrations: "Registrácie", visitors30: "Návštevníci (30 dní)", customers: "Platiaci zákazníci",
      vsPrev: "oproti predošlým 30 dňom", allTime: "celkovo", sinceStart: "od spustenia",
      plGross: "Hrubé tržby z predaja", plFees: "Poplatky za spracovanie platieb", plNet: "Čisté tržby", plMarketing: "Marketing", plOther: "Ostatné náklady (softvér, mzdy, právne…)", plPayouts: "Výplaty partnerom", plProfit: "Čistý zisk",
      plNetHint: "čo reálne príde na účet", plPayoutsHint: "odmeny za výkon vyplatené partnerom", margin: "Zisková marža",
      monthly: "Mesačné tržby vs. náklady", revenue: "Tržby", costs: "Náklady (vrátane výplat)", profit: "Zisk",
      regDaily: "Nové registrácie za deň", visDaily: "Návštevníci za deň", days: "dní", last: "Posledných",
      funnelVisitors: "Návštevníci", funnelCheckout: "Dostali sa na checkout", funnelRegistered: "Zaregistrovaní", funnelCustomers: "Zaplatili", funnelPhase2: "Dosiahli fázu 2", funnelFunded: "Funded partneri",
      funnelNote: "Návštevníci, checkout, registrácie a nákupy sa počítajú odo dňa spustenia merania návštevnosti; ďalšie kroky sú za celé obdobie.",
      roas: "Návratnosť reklamy (ROAS)", cac: "Cena za zákazníka (CAC)", arpu: "Tržby na zákazníka", aov: "Priem. hodnota objednávky", regToCust: "Registrácia → zákazník", visToReg: "Návštevník → registrácia", repeat: "Opakovaní zákazníci",
      trackingSince: "Meranie návštevnosti beží od", trackingNone: "Meranie návštevnosti sa práve zapnulo — čísla sa objavia s prvými návštevníkmi.",
      countries: "Návštevníci podľa krajiny", custCountries: "Zákazníci podľa fakturačnej krajiny", sources: "Zdroje návštevnosti", devices: "Zariadenia", langs: "Jazyk webu",
      noData: "Zatiaľ žiadne dáta", orders: "objednávok", visitorsShort: "návštevníkov",
      byState: "Účty podľa stavu", byPackage: "Aktívni hráči podľa balíčka", active: "Aktívne", closed: "Uzavreté", cancelled: "Zrušené", pending_approval: "Čakajú na schválenie fázy", funded: "Funded partneri",
      phaseRate: "Dosiahli fázu 2", closedRate: "Uzavreté účty", leads: "E-mailové leady", previews: "Náhľadové účty", waitlist: "Čakacia listina",
      tickets: "Podané tikety", tickets30: "Tikety (30 dní)", volume: "Simulovaný objem", winRate: "Úspešnosť", avgStake: "Priem. vklad", avgOdds: "Priem. kurz", bettors: "Aktívni hráči (30d)",
      ticketsDaily: "Tikety za deň", topSports: "Najhranejšie športy",
      def1: "<b>Hrubé tržby</b> = všetky úspešné platby prepočítané na USD. <b>Čisté tržby</b> sú to, čo zostane po poplatkoch za spracovanie platieb.",
      def2: "<b>Čistý zisk</b> = čisté tržby − náklady zadané tímom (marketing, softvér, mzdy, právne, ostatné) − odmeny za výkon vyplatené partnerom.",
      def3: "<b>Aktívni hráči</b> = účty, ktoré sú aktívne, čakajú na schválenie alebo sú funded. Interné, demo a testovacie účty sú zo všetkých čísel vylúčené.",
      def4: "<b>Návštevníci</b> sa počítajú bez cookies (jeden za zariadenie a deň); boty sú odfiltrované. Krajina vychádza z pripojenia návštevníka.",
      def5: "Náklady zadáva tím ručne v admin sekcii a vždy sú aktuálne podľa posledného záznamu.",
      invalid: "Tento odkaz nie je platný", invalidText: "Prístupový odkaz chýba, je nesprávny alebo bol zrušený. Požiadajte tím Fundly o nový.", failed: "Štatistiky sa nepodarilo načítať", failedText: "Skúste to prosím o chvíľu znova.", retry: "Skúsiť znova",
      other: "Ostatné", direct: "priamo", unknown: "Neznáme", mobile: "Mobil", desktop: "Počítač", tablet: "Tablet",
    },
  };
  var lang = "en";
  try { var st = localStorage.getItem("fundly:invLang") || localStorage.getItem("fundly:lang") || (navigator.language || "en"); lang = /^(sk|cs)/i.test(st) ? "sk" : "en"; } catch (e) { /* ignore */ }
  var t = function (k) { return (T[lang] && T[lang][k]) || T.en[k] || k; };

  // ---------------------------------------------------------------- helpers
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); };
  var num = function (v) { return Number(v) || 0; };
  var locale = function () { return lang === "sk" ? "sk-SK" : "en-US"; };
  var fmt = function (n) { return Math.round(num(n)).toLocaleString(locale()); };
  var usd = function (n, dec) { var v = num(n); var neg = v < 0; var s = Math.abs(v).toLocaleString(locale(), { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 }); return (neg ? "−" : "") + "$" + s; };
  var pct = function (n, dec) { return n == null ? "—" : Number(n).toLocaleString(locale(), { maximumFractionDigits: dec == null ? 1 : dec }) + " %"; };
  var dmy = function (iso) { return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" }); };
  var monthLabel = function (m) { var p = m.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, 1)).toLocaleDateString(locale(), { month: "short", year: "2-digit", timeZone: "UTC" }); };
  var flag = function (cc) { return /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint.apply(null, cc.split("").map(function (c) { return 127397 + c.charCodeAt(0); })) : "🌐"; };
  var countryName = function (cc) { try { return new Intl.DisplayNames([locale()], { type: "region" }).of(cc) || cc; } catch (e) { return cc; } };

  function delta(v) {
    if (v == null) return "";
    var cls = v > 0.5 ? "" : v < -0.5 ? " down" : " flat";
    return '<span class="chip' + cls + '">' + (v > 0.5 ? "▲" : v < -0.5 ? "▼" : "•") + " " + Math.abs(v).toLocaleString(locale(), { maximumFractionDigits: 0 }) + " %</span>";
  }

  // ---------------------------------------------------------------- charts (hand-made SVG)
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

  // grouped bars: rows = [{label, a, b, profit}]
  function barsChart(rows) {
    if (!rows.length) return '<div class="empty">' + t("noData") + "</div>";
    var W = 640, H = 250, pl = 44, pb = 28, pt = 12, pr = 8;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(r.a, r.b); }).concat([1])));
    var iw = W - pl - pr, ih = H - pt - pb, gw = iw / rows.length, bw = Math.min(26, gw / 3);
    var y = function (v) { return pt + ih - (v / max) * ih; };
    var g = "";
    for (var i = 0; i <= 4; i++) { var gv = (max / 4) * i; g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="#ffffff14"/><text class="axis" x="' + (pl - 6) + '" y="' + (y(gv) + 3) + '" text-anchor="end">' + (gv >= 1000 ? Math.round(gv / 1000) + "k" : Math.round(gv)) + "</text>"; }
    var bars = "", pts = [];
    rows.forEach(function (r, i) {
      var cx = pl + gw * i + gw / 2;
      bars += '<rect x="' + (cx - bw - 2) + '" y="' + y(r.a) + '" width="' + bw + '" height="' + Math.max(0, pt + ih - y(r.a)) + '" rx="4" fill="#14f195"><title>' + esc(r.label) + " · " + t("revenue") + ": " + usd(r.a) + "</title></rect>";
      bars += '<rect x="' + (cx + 2) + '" y="' + y(r.b) + '" width="' + bw + '" height="' + Math.max(0, pt + ih - y(r.b)) + '" rx="4" fill="#9945ff"><title>' + esc(r.label) + " · " + t("costs") + ": " + usd(r.b) + "</title></rect>";
      bars += '<text class="axis" x="' + cx + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(r.label) + "</text>";
      var pv = Math.max(Math.min(r.profit, max), -0); pts.push([cx, y(Math.max(0, r.profit))]);
    });
    var line = pts.length > 1 ? '<polyline fill="none" stroke="#ffb84d" stroke-width="2.2" stroke-linejoin="round" points="' + pts.map(function (p) { return p[0] + "," + p[1]; }).join(" ") + '"/>' : "";
    var dots = rows.map(function (r, i) { return '<circle cx="' + pts[i][0] + '" cy="' + pts[i][1] + '" r="3.4" fill="#ffb84d"><title>' + esc(r.label) + " · " + t("profit") + ": " + usd(r.profit) + "</title></circle>"; }).join("");
    return '<div class="chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img">' + g + bars + line + dots + "</svg></div>" +
      '<div class="legend"><span><i style="background:#14f195"></i>' + t("revenue") + '</span><span><i style="background:#9945ff"></i>' + t("costs") + '</span><span><i style="background:#ffb84d"></i>' + t("profit") + "</span></div>";
  }

  // area / line chart: pts = [{x:'2026-10-01', y:12}]
  function areaChart(pts, color, id) {
    if (!pts.length || pts.every(function (p) { return !p.y; })) return '<div class="empty">' + t("noData") + "</div>";
    var W = 640, H = 200, pl = 36, pb = 24, pt = 10, pr = 8;
    var max = niceMax(Math.max.apply(null, pts.map(function (p) { return p.y; })));
    var iw = W - pl - pr, ih = H - pt - pb;
    var x = function (i) { return pl + (pts.length === 1 ? iw / 2 : (iw * i) / (pts.length - 1)); };
    var y = function (v) { return pt + ih - (v / max) * ih; };
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.y).toFixed(1); }).join(" ");
    var area = line + " L" + x(pts.length - 1).toFixed(1) + " " + (pt + ih) + " L" + x(0).toFixed(1) + " " + (pt + ih) + " Z";
    var g = "";
    for (var i = 0; i <= 3; i++) { var gv = (max / 3) * i; g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(gv) + '" y2="' + y(gv) + '" stroke="#ffffff14"/><text class="axis" x="' + (pl - 6) + '" y="' + (y(gv) + 3) + '" text-anchor="end">' + (gv >= 1000 ? (gv / 1000).toFixed(1) + "k" : Math.round(gv)) + "</text>"; }
    var step = Math.max(1, Math.ceil(pts.length / 6));
    var xl = pts.map(function (p, i) { return i % step === 0 || i === pts.length - 1 ? '<text class="axis" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + dmy(p.x) + "</text>" : ""; }).join("");
    var hits = pts.length <= 120 ? pts.map(function (p, i) { return '<circle cx="' + x(i) + '" cy="' + y(p.y) + '" r="5" fill="transparent"><title>' + dmy(p.x) + ": " + fmt(p.y) + "</title></circle>"; }).join("") : "";
    return '<div class="chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img"><defs><linearGradient id="ga' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".35"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient></defs>' +
      g + '<path d="' + area + '" fill="url(#ga' + id + ')"/><path d="' + line + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>' + xl + hits + "</svg></div>";
  }

  function hbars(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="empty">' + t("noData") + "</div>";
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return '<div class="hb">' + rows.map(function (r) {
      return '<div class="row"><span class="name" title="' + esc(r.label) + '">' + (r.prefix || "") + esc(r.label) + '</span><div class="bar"><b style="width:' + Math.max(3, (r.value / max) * 100) + '%"></b></div><span class="num">' + (r.text != null ? r.text : fmt(r.value)) + "</span></div>";
    }).join("") + "</div>";
  }

  function donut(items, center) {
    var total = items.reduce(function (a, i) { return a + i.value; }, 0);
    if (!total) return '<div class="empty">' + t("noData") + "</div>";
    var acc = 0, stops = items.map(function (i) { var from = (acc / total) * 100; acc += i.value; return i.color + " " + from + "% " + (acc / total) * 100 + "%"; });
    return '<div class="donut"><div class="ring" data-c="' + esc(center) + '" style="background:conic-gradient(' + stops.join(",") + ')"></div><ul>' +
      items.map(function (i) { return '<li><i style="background:' + i.color + '"></i>' + esc(i.label) + "<b>" + fmt(i.value) + "</b></li>"; }).join("") + "</ul></div>";
  }

  // ---------------------------------------------------------------- render
  var DATA = null, RANGE = 60;

  function kpi(label, value, meta, cls, big) {
    return '<div class="card kpi' + (big ? " big" : "") + '"><div class="lbl">' + label + '</div><div class="val ' + (cls || "") + '">' + value + '</div><div class="meta">' + (meta || "") + "</div></div>";
  }

  function render() {
    var d = DATA, s = d.stats, dv = d.derived, ppl = s.people, rev = s.revenue, cst = s.costs, trf = s.traffic, act = s.activity;
    document.documentElement.lang = lang;
    $("tagline").textContent = t("tagline");
    $("refresh").textContent = t("refresh");
    $("who").textContent = t("hi") + ", " + d.investor.name + " · " + t("updated") + " " + new Date(s.generated_at).toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" });
    document.querySelectorAll("#langSeg button").forEach(function (b) { b.classList.toggle("on", b.dataset.l === lang); });

    var profitCls = dv.net_profit >= 0 ? "pos" : "neg";
    var h = "";
    h += '<div class="hello" style="margin-top:6px"><h1>' + t("heroTitle") + "</h1><p>" + t("heroText") + "</p></div>";

    // ---- headline
    h += '<section class="sec"><h2>' + t("s_headline") + '</h2><div class="grid g6">' +
      kpi(t("netProfit"), usd(dv.net_profit), (dv.profit_margin_pct != null ? t("margin") + ": " + pct(dv.profit_margin_pct) : t("allTime")), profitCls, true) +
      kpi(t("grossRevenue"), usd(rev.gross), delta(dv.revenue_change_pct) + " " + t("vsPrev")) +
      kpi(t("totalCosts"), usd(dv.total_outflow), t("marketing") + ": " + usd(cst.marketing)) +
      kpi(t("activePlayers"), fmt(ppl.active_players), fmt(ppl.funded_players) + " " + t("funded").toLowerCase()) +
      kpi(t("registrations"), fmt(ppl.registrations_total), delta(dv.registrations_change_pct) + " " + t("vsPrev")) +
      kpi(t("visitors30"), trf.visitors_total ? fmt(trf.visitors_30d) : "—", trf.visitors_total ? delta(dv.visitors_change_pct) + " " + t("vsPrev") : t("trackingNone")) +
      kpi(t("customers"), fmt(ppl.customers), fmt(ppl.purchases) + " " + t("orders")) +
      "</div></section>";

    // ---- P&L
    var rows = (rev.by_month || []).map(function (m) { return { label: monthLabel(m.m), a: num(m.gross), b: num(m.costs) + num(m.payouts), profit: num(m.net) - num(m.costs) - num(m.payouts) }; });
    var otherCosts = num(cst.total) - num(cst.marketing);
    h += '<section class="sec"><h2>' + t("s_pl") + '</h2><div class="grid g21"><div class="card"><table class="pl"><tbody>' +
      '<tr><td>' + t("plGross") + "</td><td>" + usd(rev.gross, 2) + "</td></tr>" +
      '<tr class="minus"><td>' + t("plFees") + "</td><td>" + neg(dv.processing_fees) + "</td></tr>" +
      '<tr><td>' + t("plNet") + '<span class="hint">' + t("plNetHint") + "</span></td><td>" + usd(dv.net_revenue, 2) + "</td></tr>" +
      '<tr class="minus"><td>' + t("plMarketing") + "</td><td>" + neg(cst.marketing) + "</td></tr>" +
      '<tr class="minus"><td>' + t("plOther") + "</td><td>" + neg(otherCosts) + "</td></tr>" +
      '<tr class="minus"><td>' + t("plPayouts") + '<span class="hint">' + t("plPayoutsHint") + "</span></td><td>" + neg(cst.partner_payouts_paid) + "</td></tr>" +
      '<tr class="total"><td>' + t("plProfit") + '</td><td class="' + profitCls + '">' + usd(dv.net_profit, 2) + "</td></tr></tbody></table></div>" +
      '<div class="card"><h3>' + t("monthly") + "</h3>" + barsChart(rows) + "</div></div></section>";

    // ---- growth
    var regPts = (ppl.registrations_by_day || []).slice(-RANGE).map(function (r) { return { x: r.d, y: num(r.n) }; });
    var visPts = (trf.by_day || []).slice(-RANGE).map(function (r) { return { x: r.d, y: num(r.uv) }; });
    h += '<section class="sec"><h2>' + t("s_growth") + '</h2><div style="display:flex;justify-content:flex-end;margin:-6px 0 10px"><div class="seg" id="rangeSeg">' +
      [30, 60, 90].map(function (n) { return '<button data-r="' + n + '" class="' + (n === RANGE ? "on" : "") + '">' + n + " " + t("days") + "</button>"; }).join("") + "</div></div>" +
      '<div class="grid g2"><div class="card"><h3>' + t("regDaily") + "</h3>" + areaChart(regPts, "#14f195", "r") + '</div><div class="card"><h3>' + t("visDaily") + "</h3>" +
      (trf.visitors_total ? areaChart(visPts, "#9945ff", "v") : '<div class="empty">' + t("trackingNone") + "</div>") + "</div></div></section>";

    // ---- funnel & marketing
    var f = trf.funnel || {};
    var steps = [
      [t("funnelVisitors"), num(f.visitors), null],
      [t("funnelCheckout"), num(f.checkout_visitors), num(f.visitors)],
      [t("funnelRegistered"), num(f.registrations), num(f.visitors)],
      [t("funnelCustomers"), num(f.purchases), num(f.registrations)],
    ];
    var lifetime = [
      [t("funnelPhase2"), num(ppl.reached_phase2), num(ppl.customers)],
      [t("funnelFunded"), num(ppl.funded_players), num(ppl.customers)],
    ];
    var stepHtml = function (st) { return '<div class="step"><span>' + st[0] + "</span><span><b>" + fmt(st[1]) + "</b>" + (st[2] ? "<small>" + pct(st[2] > 0 ? (100 * st[1]) / st[2] : null) + "</small>" : "") + "</span></div>"; };
    h += '<section class="sec"><h2>' + t("s_funnel") + '</h2><div class="grid g2"><div class="card"><div class="funnel">' +
      (trf.visitors_total ? steps.map(stepHtml).join("") : "") + lifetime.map(stepHtml).join("") + '</div><p class="note" style="margin-top:12px">' + t("funnelNote") + "</p></div>" +
      '<div class="card"><div class="stat3">' +
      stat(t("marketing"), usd(cst.marketing)) + stat(t("roas"), dv.roas == null ? "—" : dv.roas.toLocaleString(locale(), { maximumFractionDigits: 2 }) + "×") + stat(t("cac"), dv.cac == null ? "—" : usd(dv.cac, 2)) +
      stat(t("arpu"), dv.arpu == null ? "—" : usd(dv.arpu, 2)) + stat(t("aov"), dv.aov == null ? "—" : usd(dv.aov, 2)) + stat(t("repeat"), pct(dv.repeat_customer_pct)) +
      stat(t("regToCust"), pct(dv.registration_to_customer_pct)) + stat(t("visToReg"), trf.visitors_total ? pct(dv.visitor_to_registration_pct) : "—") + stat(t("leads"), fmt(ppl.discount_leads)) +
      "</div></div></div></section>";

    // ---- audience
    var cRows = (trf.by_country || []).slice(0, 10).map(function (r) { return { label: countryName(r.country), value: num(r.n), prefix: flag(r.country) + " ", text: fmt(r.n) }; });
    var pRows = (rev.by_country || []).filter(function (r) { return r.country !== "??"; }).slice(0, 10).map(function (r) { return { label: countryName(r.country), value: num(r.gross), prefix: flag(r.country) + " ", text: usd(r.gross) + " · " + fmt(r.n) }; });
    var sRows = (trf.by_source || []).map(function (r) { return { label: r.source === "direct" ? t("direct") : r.source, value: num(r.n) }; });
    var dRows = (trf.by_device || []).map(function (r) { return { label: t(r.device) || r.device, value: num(r.n) }; });
    var lRows = (trf.by_language || []).map(function (r) { return { label: String(r.lang).toUpperCase(), value: num(r.n) }; });
    h += '<section class="sec"><h2>' + t("s_audience") + "</h2>" + (trf.tracking_since || DATA.stats.tracking_since ? '<p class="note" style="margin:-4px 0 12px">' + t("trackingSince") + " " + new Date(s.tracking_since).toLocaleDateString(locale(), { dateStyle: "medium" }) + ".</p>" : '<p class="note" style="margin:-4px 0 12px">' + t("trackingNone") + "</p>") +
      '<div class="grid g2"><div class="card"><h3>' + t("countries") + "</h3>" + (trf.visitors_total ? hbars(cRows) : '<div class="empty">' + t("trackingNone") + "</div>") + '</div><div class="card"><h3>' + t("custCountries") + "</h3>" + hbars(pRows) + "</div></div>" +
      '<div class="grid g3" style="margin-top:14px"><div class="card"><h3>' + t("sources") + "</h3>" + hbars(sRows) + '</div><div class="card"><h3>' + t("devices") + "</h3>" + hbars(dRows) + '</div><div class="card"><h3>' + t("langs") + "</h3>" + hbars(lRows) + "</div></div></section>";

    // ---- players
    var states = ppl.players_by_state || {};
    var stateItems = [
      { label: t("active"), value: num(states.active), color: "#14f195" },
      { label: t("pending_approval"), value: num(states.pending_approval), color: "#ffb84d" },
      { label: t("funded"), value: num(states.funded), color: "#4da3ff" },
      { label: t("closed"), value: num(states.breached), color: "#ff5c5c" },
      { label: t("cancelled"), value: num(states.cancelled), color: "#8a8a99" },
    ].filter(function (i) { return i.value > 0; });
    var totalAcc = Object.keys(states).reduce(function (a, k) { return a + num(states[k]); }, 0);
    var pkgRows = Object.keys(ppl.active_by_package || {}).map(function (k) { return { label: k.charAt(0).toUpperCase() + k.slice(1), value: num(ppl.active_by_package[k]) }; }).sort(function (a, b) { return b.value - a.value; });
    h += '<section class="sec"><h2>' + t("s_players") + '</h2><div class="grid g3"><div class="card"><h3>' + t("byState") + "</h3>" + donut(stateItems, String(totalAcc)) + '</div><div class="card"><h3>' + t("byPackage") + "</h3>" + hbars(pkgRows) + "</div>" +
      '<div class="card"><div class="stat3" style="grid-template-columns:1fr 1fr">' + stat(t("phaseRate"), pct(dv.phase2_rate_pct)) + stat(t("closedRate"), pct(dv.closed_rate_pct)) + stat(t("previews"), fmt(ppl.previews)) + stat(t("waitlist"), fmt(ppl.waitlist)) + "</div></div></div></section>";

    // ---- activity
    var tPts = (act.tickets_by_day || []).slice(-Math.min(RANGE, 60)).map(function (r) { return { x: r.d, y: num(r.n) }; });
    var spRows = (act.top_sports || []).map(function (r) { return { label: String(r.sport).charAt(0).toUpperCase() + String(r.sport).slice(1), value: num(r.n) }; });
    h += '<section class="sec"><h2>' + t("s_activity") + '</h2><div class="grid g21"><div class="card"><h3>' + t("ticketsDaily") + "</h3>" + areaChart(tPts, "#4da3ff", "t") + "</div>" +
      '<div class="card"><div class="stat3" style="grid-template-columns:1fr 1fr">' + stat(t("tickets"), fmt(act.tickets_total)) + stat(t("tickets30"), fmt(act.tickets_30d)) + stat(t("volume"), usd(act.volume_total)) + stat(t("winRate"), pct(act.win_rate)) + stat(t("avgStake"), usd(act.avg_stake)) + stat(t("avgOdds"), act.avg_odds == null ? "—" : num(act.avg_odds).toFixed(2)) + "</div></div></div>" +
      '<div class="card" style="margin-top:14px"><h3>' + t("topSports") + "</h3>" + hbars(spRows) + "</div></section>";

    // ---- notes
    h += '<div class="foot"><h2 style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--t3);margin-bottom:10px">' + t("s_defs") + '</h2><p class="note">' +
      [t("def1"), t("def2"), t("def3"), t("def4"), t("def5")].join("<br>") + "</p></div>";

    $("app").innerHTML = h;
    var seg = $("rangeSeg");
    if (seg) seg.addEventListener("click", function (e) { var b = e.target.closest("button[data-r]"); if (!b) return; RANGE = +b.dataset.r; render(); });
  }

  // cost line: "−$12.00", but a plain "$0.00" when there is nothing to subtract
  function neg(v) { return num(v) > 0 ? "−" + usd(v, 2) : usd(0, 2); }
  function stat(l, v) { return '<div><div class="l">' + l + '</div><div class="v">' + v + "</div></div>"; }

  // ---------------------------------------------------------------- load
  function gate(title, text, retry) {
    $("app").innerHTML = '<div class="gate"><div class="box"><div style="font-size:42px">🔒</div><h1>' + esc(title) + "</h1><p>" + esc(text) + "</p>" + (retry ? '<p style="margin-top:16px"><button class="btn" id="retryBtn">' + t("retry") + "</button></p>" : "") + "</div></div>";
    var b = $("retryBtn"); if (b) b.addEventListener("click", load);
  }

  var token = new URLSearchParams(location.search).get("k") || "";
  async function load() {
    if (!token) { gate(t("invalid"), t("invalidText")); return; }
    try {
      // lokální náhled s ukázkovými daty (jen na localhost): investors.html?k=demo&mock=1
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && window.__INVESTOR_MOCK) { DATA = window.__INVESTOR_MOCK; render(); return; }
      var res = await fetch(FUNDLY_SUPABASE_URL + "/functions/v1/investor-stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: token }) });
      if (res.status === 401) { gate(t("invalid"), t("invalidText")); return; }
      if (!res.ok) throw new Error("HTTP " + res.status);
      DATA = await res.json();
      render();
    } catch (e) {
      console.warn("investors:", e);
      if (!DATA) gate(t("failed"), t("failedText"), true);
    }
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("#langSeg button");
    if (b) { lang = b.dataset.l; try { localStorage.setItem("fundly:invLang", lang); } catch (x) { /* ignore */ } if (DATA) render(); }
    if (e.target.id === "refresh") load();
  });
  // mock a skript se uloží až po načtení config.js (viz investors.html), proto vlastní start
  load();
  setInterval(load, 10 * 60 * 1000);
})();
