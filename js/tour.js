/* Fundly — průvodce dashboardem (onboarding tour) + vysvětlivky sekcí.
   - Při prvním příchodu na dashboard se zeptá, jestli chce hráč krátkou prohlídku.
   - Prohlídka krok za krokem zvýrazní část stránky, vysvětlí ji a sama přepíná sekce.
   - V rohu je stále tlačítko „?“: celá prohlídka nebo vysvětlení právě otevřené sekce.
   Bez závislostí; texty cs (i pro sk) + en; desktop i mobil (spodní navigace / „Více“). */
(function () {
  const DONE_KEY = "fundly:tourDone";
  const lang = () => {
    let l = "en";
    try { l = (typeof FUNDLY_I18N !== "undefined" && FUNDLY_I18N.getLang()) || localStorage.getItem("fundly:lang") || "en"; } catch (e) { /* */ }
    return l === "cs" || l === "sk" ? "cs" : "en";
  };

  // ---------- texty ----------
  const UI = {
    cs: {
      promptTitle: "Vítej ve Fundly 👋", promptText: "Chceš krátkou prohlídku? Za minutu ti ukážeme, kde co najdeš a jak podat první tip.",
      start: "Ukázat prohlídku", later: "Teď ne", next: "Další", back: "Zpět", done: "Hotovo", skip: "Přeskočit",
      moreHint: " Na mobilu tuhle sekci najdeš pod tlačítkem Více.", help: "Nápověda", menuTour: "Prohlídka celého dashboardu", menuSection: "Vysvětlit tuhle sekci", of: "z",
    },
    en: {
      promptTitle: "Welcome to Fundly 👋", promptText: "Want a quick tour? In a minute we'll show you where everything is and how to submit your first tip.",
      start: "Show me around", later: "Not now", next: "Next", back: "Back", done: "Done", skip: "Skip",
      moreHint: " On mobile you'll find this section under More.", help: "Help", menuTour: "Full dashboard tour", menuSection: "Explain this section", of: "of",
    },
  };
  const S = {
    welcome: {
      cs: ["Vítej ve Fundly 👋", "Tipuješ se simulovaným kapitálem — do žádného tipu nevkládáš vlastní peníze. Cílem je splnit cíl fáze a dodržet limity. Pojďme na to."],
      en: ["Welcome to Fundly 👋", "You tip with simulated capital — you never put your own money on any tip. The goal is to hit the phase target while staying within the limits. Let's go."],
    },
    balance: {
      cs: ["Zůstatek a fáze", "Tady vidíš simulovaný zůstatek, zisk v aktuální fázi a svůj balíček. Fáze 1 = cíl +10 %, Fáze 2 = +5 % kapitálu, na každou máš 30 dní."],
      en: ["Balance and phase", "Your simulated balance, profit in the current phase and your package. Phase 1 target is +10 %, Phase 2 is +5 % of capital, 30 days each."],
    },
    stats: {
      cs: ["Rychlé statistiky", "Zisk, kolik zbývá do cíle, počet tipů a úspěšnost na jeden pohled."],
      en: ["Quick stats", "Profit, how much is left to the target, number of tips and win rate at a glance."],
    },
    limits: {
      cs: ["Limity a pravidla", "Hlídej si max. celkovou ztrátu (−10 % kapitálu) a denní limit (−4 %, nuluje se o půlnoci UTC). V záložkách najdeš i pravidla a svou cestu k účtu Partner."],
      en: ["Limits and rules", "Keep an eye on the max. total loss (−10 % of capital) and the daily limit (−4 %, resets at midnight UTC). The tabs also show the rules and your path to a Partner account."],
    },
    recent: {
      cs: ["Poslední tipy", "Tvoje poslední tipy a jejich stav — čeká, výhra, prohra nebo vráceno."],
      en: ["Recent tips", "Your latest tips and their status — pending, won, lost or returned."],
    },
    navTips: {
      cs: ["Tipy", "Tady tipuješ. Otevřeme to."],
      en: ["Tips", "This is where you submit tips. Let's open it."],
    },
    sports: {
      cs: ["Sporty", "Vyber sport — fotbal, hokej, basketbal, tenis, esporty, MMA, wrestling a další."],
      en: ["Sports", "Pick a sport — football, hockey, basketball, tennis, esports, MMA, wrestling and more."],
    },
    filters: {
      cs: ["Hledání a filtry", "Najdi tým nebo ligu, filtruj podle data a kurzu. Přepínač LIVE ukáže zápasy, které právě běží — kurzy se v nich mění živě."],
      en: ["Search and filters", "Find a team or league, filter by date and odds. The LIVE switch shows matches in progress — their odds update live."],
    },
    bank: {
      cs: ["Tvůj rámec", "Aktuální zůstatek, maximální vklad na jeden tip (1,5 % kapitálu) a povolený rozsah kurzů 1.00–8.00."],
      en: ["Your frame", "Current balance, the maximum stake per tip (1.5 % of capital) and the allowed odds range 1.00–8.00."],
    },
    matches: {
      cs: ["Zápasy a kurzy", "Klikni na kurz a přidá se do tipu. Kliknutím na zápas otevřeš další trhy (handicap, počet gólů, oba týmy skórují…)."],
      en: ["Matches and odds", "Click an odd to add it to your tip. Click a match to open more markets (handicap, totals, both teams to score…)."],
    },
    slip: {
      cs: ["Tvůj tip", "Zadej vklad a klikni na Podat tip. Víc voleb z různých zápasů = kombinace. Těsně před podáním vždy ověříme aktuální kurz."],
      en: ["Your tip", "Enter the stake and click Place tip. Several selections from different matches make a combo. We always re-check the current odds right before submitting."],
    },
    navPerf: {
      cs: ["Výkon", "Podrobné statistiky — přehled tipů, finance, denní vývoj a historie."],
      en: ["Performance", "Detailed statistics — tip overview, financials, daily results and history."],
    },
    navRewards: {
      cs: ["Odměny", "Po splnění obou fází se staneš Fundly Partnerem a tady žádáš o odměnu — 80 % z výkonu."],
      en: ["Rewards", "After passing both phases you become a Fundly Partner and request your rewards here — 80 % of your performance."],
    },
    navNews: {
      cs: ["Novinky", "Čerstvé sportovní zprávy z ověřených zdrojů — ať víš, co se děje, než tipneš."],
      en: ["News", "Fresh sports news from trusted sources — know what's happening before you tip."],
    },
    navAcademy: {
      cs: ["Akademie", "Krátké lekce: řízení kapitálu, co znamenají kurzy, value, kvalifikační tipy a ztráta."],
      en: ["Academy", "Short lessons: capital management, what odds mean, value, qualifying tips and drawdown."],
    },
    navProfile: {
      cs: ["Profil", "Nastavení účtu, zabezpečení (dvoufázové ověření), odznaky, žebříček a podpora."],
      en: ["Profile", "Account settings, security (two-factor authentication), badges, leaderboard and support."],
    },
    helpBtn: {
      cs: ["Kdykoli znovu", "Prohlídku i vysvětlení každé sekce spustíš kdykoli tímhle tlačítkem. Hodně štěstí! 🍀"],
      en: ["Any time", "Restart the tour or get an explanation of any section with this button. Good luck! 🍀"],
    },
    // vysvětlivky jednotlivých sekcí
    perfStats: { cs: ["Statistiky", "Úspěšnost, průměrný kurz, zisk a další čísla za celý balíček."], en: ["Statistics", "Win rate, average odds, profit and more for your whole package."] },
    perfBreak: { cs: ["Rozpad tipů", "Kolik tipů je vyhraných, prohraných, vrácených a čekajících."], en: ["Tip breakdown", "How many tips are won, lost, returned and pending."] },
    perfDaily: { cs: ["Den po dni", "Vývoj zůstatku a čistý výsledek každého dne v aktuální fázi."], en: ["Day by day", "Balance and net result for each day of the current phase."] },
    rwForm: { cs: ["Žádost o odměnu", "Zadej částku a způsob — dostaneš 80 % zisku, max. $4,000 na žádost. Žádost schválíme do 24 hodin."], en: ["Reward request", "Enter the amount and method — you receive 80 % of the profit, max. $4,000 per request. We approve requests within 24 hours."] },
    rwConds: { cs: ["Podmínky", "Před odměnou: rezerva +5 %, 5 kvalifikačních tipů, ověření totožnosti a 14 dní od poslední odměny."], en: ["Conditions", "Before a reward: +5 % buffer, 5 qualifying tips, identity verification and 14 days since the last reward."] },
    rwHist: { cs: ["Historie", "Přehled tvých žádostí a jejich stav."], en: ["History", "Your requests and their status."] },
    newsFilters: { cs: ["Zdroje", "Filtruj zprávy podle webu, ze kterého pocházejí."], en: ["Sources", "Filter the news by the website they come from."] },
    newsList: { cs: ["Zprávy", "Klikni na titulek — celý článek se otevře na webu zdroje."], en: ["Headlines", "Click a headline — the full article opens on the source website."] },
    acadHead: { cs: ["Akademie", "Projdi si lekce, než začneš — ušetří ti to zbytečné chyby."], en: ["Academy", "Go through the lessons before you start — they'll save you from avoidable mistakes."] },
    perfTabs: { cs: ["Přehled, Analýza a Měsíc", "Analýza ukáže, kde vyděláváš a kde ztrácíš. Měsíc je tvůj měsíční přehled — nejlepší sport a tip, srovnání s minulým měsícem a karta ke sdílení na Instagram."], en: ["Overview, Analytics and Month", "Analytics shows where you gain and where you lose. Month is your monthly recap — best sport and tip, comparison with last month and a card to share on Instagram."] },
    profTabs: { cs: ["Sekce profilu", "Přepínej mezi profilem, odznaky, doporučeními, nastavením a podporou. Odznaky sbíráš za disciplínu, deník i akademii — odemčený odznak můžeš sdílet."], en: ["Profile sections", "Switch between profile, badges, referrals, settings and support. Badges reward discipline, your journal and the Academy — share any badge you unlock."] },
    affCodes: { cs: ["Tvoje kódy", "Kódy, se kterými kamarádi nakupují — a co ti přinesly."], en: ["Your codes", "Codes your friends buy with — and what they earned you."] },
    affRefs: { cs: ["Doporučení hráči", "Kdo si koupil balíček s tvým kódem."], en: ["Referred players", "Who bought a package with your code."] },
  };

  // cíle: první viditelný selektor; navigace podle zařízení (sidebar / spodní lišta / „Více“)
  const MORE = ["zebricek", "affiliate", "novinky", "akademie", "profil"];
  const nav = (view) => [`.dside [data-view="${view}"]`, `.dnav-mobile [data-view="${view}"]`, MORE.includes(view) ? "#dnavMoreBtn" : null].filter(Boolean);

  const FULL = [
    { id: "welcome" },
    { id: "balance", view: "prehled", target: ["#balanceCard"] },
    { id: "stats", view: "prehled", target: ["#ovStatGrid"] },
    { id: "limits", view: "prehled", target: ["#ovLimity", "#ovTabs"] },
    { id: "navTips", view: "prehled", target: nav("sazeni") },
    { id: "sports", view: "sazeni", target: ["#sportTabs"] },
    { id: "filters", view: "sazeni", target: ["#betFiltersPanel"] },
    { id: "matches", view: "sazeni", target: ["#matchList .match", "#matchList"] },
    { id: "slip", view: "sazeni", target: ["#slipPanel", "#mobileSlipBar"] },
    { id: "navPerf", view: "sazeni", target: nav("vykon") },
    { id: "navRewards", target: nav("vyplaty") },
    { id: "navNews", target: nav("novinky") },
    { id: "navAcademy", target: nav("akademie") },
    { id: "navProfile", target: nav("profil") },
    { id: "helpBtn", target: [".tour-help"] },
  ];
  const SECTIONS = {
    prehled: [{ id: "balance", target: ["#balanceCard"] }, { id: "stats", target: ["#ovStatGrid"] }, { id: "recent", target: ["#recentTicketsPanel"] }, { id: "limits", target: ["#ovLimity", "#ovTabs"] }],
    sazeni: [{ id: "bank", target: [".bank-bar", "#bankBalance"] }, { id: "sports", target: ["#sportTabs"] }, { id: "filters", target: ["#betFiltersPanel"] }, { id: "matches", target: ["#matchList .match", "#matchList"] }, { id: "slip", target: ["#slipPanel", "#mobileSlipBar"] }],
    vykon: [{ id: "perfTabs", target: [".an-tabs"] }, { id: "perfStats", target: ["#vykonStatGrid"] }, { id: "perfBreak", target: ["#vykonBreakdown"] }, { id: "perfDaily", target: ["#vykonDailyTable"] }],
    vyplaty: [{ id: "rwForm", target: ["#wdForm"] }, { id: "rwConds", target: ["#wdConds"] }, { id: "rwHist", target: ["#wdHistory"] }],
    novinky: [{ id: "newsFilters", target: ["#newsFilters"] }, { id: "newsList", target: ["#newsList .news-item", "#newsList"] }],
    akademie: [{ id: "acadHead", target: ["#view-akademie .dash-head"] }],
    profil: [{ id: "profTabs", target: ["#profileTabs"] }],
    affiliate: [{ id: "affCodes", target: ["#affCodes"] }, { id: "affRefs", target: ["#affReferrals"] }],
  };

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  // "selektor@panel" = nejbližší .panel kolem prvku (zvýraznit celý panel, ne jen jeho část)
  const resolve = (sels) => {
    for (const s of sels || []) {
      const [sel, up] = s.split("@");
      let el = document.querySelector(sel);
      if (el && up) el = el.closest("." + up) || el;
      if (visible(el)) return el;
    }
    return null;
  };
  const currentView = () => {
    const v = [...document.querySelectorAll(".dash-view")].find((x) => !x.hidden);
    return v ? v.id.replace(/^view-/, "") : "prehled";
  };

  // ---------- styly ----------
  function css() {
    if (document.getElementById("tour-css")) return;
    const st = document.createElement("style");
    st.id = "tour-css";
    st.textContent = `
      .tour-help{position:fixed;right:20px;bottom:84px;z-index:61;width:42px;height:42px;border-radius:50%;border:1px solid #ffffff2a;background:#14141b;color:#e8e8ec;font:700 18px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;box-shadow:0 8px 24px -8px rgb(0 0 0/.7);display:grid;place-items:center}
      .tour-help:hover{border-color:#14f195;color:#14f195}
      .tour-menu{position:fixed;z-index:62;background:#0d0d12;border:1px solid #ffffff22;border-radius:12px;padding:6px;box-shadow:0 12px 40px -8px rgb(0 0 0/.7);min-width:240px}
      .tour-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:#e8e8ec;font:600 14px/1.3 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:10px 12px;border-radius:8px;cursor:pointer}
      .tour-menu button:hover{background:#ffffff10}
      .tour-shade{position:fixed;inset:0;z-index:9990;background:transparent}
      .tour-spot{position:fixed;z-index:9991;border-radius:12px;pointer-events:none;transition:all .25s ease}
      .tour-card{position:fixed;z-index:9992;width:min(340px,calc(100vw - 24px));background:#0d0d12;color:#e8e8ec;border:1px solid #ffffff26;border-radius:16px;padding:16px 16px 12px;box-shadow:0 16px 48px -10px rgb(0 0 0/.8);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .tour-card h4{margin:0 0 6px;font-size:16px;color:#fff}
      .tour-card p{margin:0 0 14px;color:#c9c9d2}
      .tour-foot{display:flex;align-items:center;gap:8px}
      .tour-count{color:#7a7a86;font-size:12px;margin-right:auto}
      .tour-btn{border-radius:10px;padding:8px 13px;font:700 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;cursor:pointer;border:1px solid #ffffff2a;background:transparent;color:#e8e8ec}
      .tour-btn.primary{background:#14f195;border-color:#14f195;color:#04140c}
      .tour-btn.link{border:0;color:#9a9aa8;padding:8px 6px}
      @media (max-width:1023px){.tour-help{right:14px;bottom:140px}}
      @media (prefers-reduced-motion:reduce){.tour-spot{transition:none}}`;
    document.head.appendChild(st);
  }

  // ---------- prohlídka ----------
  let steps = [], idx = 0, layer = null;
  function close(markDone) {
    if (layer) { layer.shade.remove(); layer.spot.remove(); layer.card.remove(); layer = null; }
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
    if (markDone) { try { localStorage.setItem(DONE_KEY, "1"); } catch (e) { /* */ } }
  }
  function onKey(e) {
    if (!layer) return;
    if (e.key === "Escape") close(true);
    else if (e.key === "ArrowRight") go(idx + 1);
    else if (e.key === "ArrowLeft") go(idx - 1);
  }
  function place() {
    if (!layer) return;
    const step = steps[idx];
    const el = step.target ? resolve(step.target) : null;
    const { spot, card } = layer;
    const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    // stín jen tak velký, aby pokryl obrazovku — obří (9999 px) stín mobilní prohlížeče s vysokým DPR zahodí
    const shadow = `0 0 0 ${Math.ceil(Math.hypot(vw, vh)) + 20}px rgb(2 2 4 / .72), 0 0 0 2px #14f195`;
    if (!el) {
      spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;box-shadow:${shadow.replace(", 0 0 0 2px #14f195", "")}`;
      card.style.left = `${Math.max(12, (vw - card.offsetWidth) / 2)}px`;
      card.style.top = `${Math.max(12, (vh - card.offsetHeight) / 2)}px`;
      return;
    }
    const r = el.getBoundingClientRect();
    const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
    const w = Math.min(vw - left - 4, r.width + pad * 2), h = Math.min(vh - top - 4, r.height + pad * 2);
    spot.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px;box-shadow:${shadow}`;
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let ct = top + h + 12;
    if (ct + ch > vh - 12) ct = top - ch - 12;            // nad prvek
    if (ct < 12) ct = Math.max(12, vh - ch - 12);         // jinak dole na obrazovce
    let cl = Math.min(Math.max(12, left), vw - cw - 12);
    if (r.left > vw * 0.55 && cl + cw > r.left) cl = Math.max(12, r.left - cw - 16); // vedle pravého panelu
    card.style.top = `${ct}px`;
    card.style.left = `${cl}px`;
  }
  function go(n) {
    if (n < 0) return;
    if (n >= steps.length) { close(true); return; }
    idx = n;
    const step = steps[idx];
    if (step.view && typeof showView === "function" && currentView() !== step.view) showView(step.view);
    const t = (S[step.id] || {})[lang()] || ["", ""];
    const u = UI[lang()];
    layer.card.innerHTML = `<h4></h4><p></p><div class="tour-foot"><span class="tour-count"></span>
      <button type="button" class="tour-btn link" data-t="skip"></button>
      ${idx > 0 ? '<button type="button" class="tour-btn" data-t="back"></button>' : ""}
      <button type="button" class="tour-btn primary" data-t="next"></button></div>`;
    layer.card.querySelector("h4").textContent = t[0];
    const resolved = step.target ? resolve(step.target) : null;
    layer.card.querySelector("p").textContent = t[1] + (resolved && resolved.id === "dnavMoreBtn" ? u.moreHint : "");
    layer.card.querySelector(".tour-count").textContent = `${idx + 1} ${u.of} ${steps.length}`;
    layer.card.querySelector('[data-t="skip"]').textContent = u.skip;
    const back = layer.card.querySelector('[data-t="back"]');
    if (back) back.textContent = u.back;
    layer.card.querySelector('[data-t="next"]').textContent = idx === steps.length - 1 ? u.done : u.next;
    // počkat na překreslení sekce (showView), pak prvek posunout do zorného pole a umístit
    setTimeout(() => {
      const el = step.target ? resolve(step.target) : null;
      if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
      setTimeout(place, 60);
    }, step.view ? 350 : 30);
    layer.card.querySelector('[data-t="next"]').focus({ preventScroll: true });
  }
  function start(list) {
    close(false);
    closeMenu();
    css();
    steps = list.filter((s) => !s.target || s.id === "helpBtn" || resolve(s.target) || s.view);
    if (!steps.length) return;
    const shade = document.createElement("div"); shade.className = "tour-shade";
    const spot = document.createElement("div"); spot.className = "tour-spot";
    const card = document.createElement("div"); card.className = "tour-card";
    card.setAttribute("role", "dialog"); card.setAttribute("aria-live", "polite");
    card.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]");
      if (!b) return;
      if (b.dataset.t === "next") go(idx + 1);
      else if (b.dataset.t === "back") go(idx - 1);
      else close(true);
    });
    shade.addEventListener("click", () => {}); // kliky mimo kartu během prohlídky nic nedělají
    document.body.append(shade, spot, card);
    layer = { shade, spot, card };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("keydown", onKey);
    go(0);
  }

  // ---------- první příchod: dotaz ----------
  function prompt() {
    css();
    const u = UI[lang()];
    const card = document.createElement("div");
    card.className = "tour-card";
    card.setAttribute("role", "dialog");
    card.style.cssText = "left:50%;top:50%;transform:translate(-50%,-50%)";
    const shade = document.createElement("div");
    shade.className = "tour-shade";
    shade.style.background = "rgb(2 2 4 / .6)";
    card.innerHTML = `<h4></h4><p></p><div class="tour-foot"><span class="tour-count"></span>
      <button type="button" class="tour-btn" data-p="later"></button><button type="button" class="tour-btn primary" data-p="start"></button></div>`;
    card.querySelector("h4").textContent = u.promptTitle;
    card.querySelector("p").textContent = u.promptText;
    card.querySelector('[data-p="later"]').textContent = u.later;
    card.querySelector('[data-p="start"]').textContent = u.start;
    card.addEventListener("click", (e) => {
      const b = e.target.closest("[data-p]");
      if (!b) return;
      shade.remove(); card.remove();
      try { localStorage.setItem(DONE_KEY, "1"); } catch (err) { /* */ }
      if (b.dataset.p === "start") start(FULL);
    });
    document.body.append(shade, card);
  }

  // ---------- tlačítko „?“ v rohu ----------
  let menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(btn) {
    if (menu) { closeMenu(); return; }
    const u = UI[lang()];
    menu = document.createElement("div");
    menu.className = "tour-menu";
    menu.innerHTML = '<button type="button" data-m="tour"></button><button type="button" data-m="section"></button>';
    menu.querySelector('[data-m="tour"]').textContent = "🧭 " + u.menuTour;
    menu.querySelector('[data-m="section"]').textContent = "💡 " + u.menuSection;
    const section = SECTIONS[currentView()];
    if (!section) menu.querySelector('[data-m="section"]').remove();
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      closeMenu();
      if (b.dataset.m === "tour") start(FULL);
      else start(SECTIONS[currentView()] || FULL);
    });
    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.right = `${window.innerWidth - r.right}px`;
    menu.style.bottom = `${window.innerHeight - r.top + 8}px`;
  }
  function helpButton() {
    if (document.querySelector(".tour-help")) return;
    css();
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tour-help";
    b.textContent = "?";
    const setLabel = () => { b.setAttribute("aria-label", UI[lang()].help); b.title = UI[lang()].help; };
    setLabel();
    document.addEventListener("fundly:lang-changed", setLabel);
    b.addEventListener("click", (e) => { e.stopPropagation(); openMenu(b); });
    document.addEventListener("click", (e) => { if (menu && !e.target.closest(".tour-menu")) closeMenu(); });
    document.body.appendChild(b);
  }

  // ---------- start ----------
  function init() {
    // jen dashboard s účtem nebo v náhledu (v omezeném režimu bez účtu nejsou sekce k ukázání)
    const ready = () => !document.body.classList.contains("limited") && document.getElementById("balanceCard");
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (document.body.classList.contains("limited")) { clearInterval(wait); return; }
      if (!ready() || tries < 3) { if (tries > 40) clearInterval(wait); return; }
      clearInterval(wait);
      helpButton();
      let done = false;
      try { done = !!localStorage.getItem(DONE_KEY); } catch (e) { done = true; }
      const blocked = document.querySelector(".cookie-bar, .modal-backdrop:not([hidden]), .tour-card");
      if (!done) setTimeout(() => { if (!document.querySelector(".tour-card")) prompt(); }, blocked ? 6000 : 1200);
    }, 500);
  }
  window.FundlyTour = { start: () => start(FULL), section: () => start(SECTIONS[currentView()] || FULL) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
