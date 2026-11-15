/* Fundly — sekce "Nástroje" (#view-nastroje): kalkulačky pro práci s kurzy.
   Čistě na klientu, počítá se okamžitě při psaní. Deník tipů (záložka "Deník")
   vykresluje js/journal.js (FundlyJournal.render).
   Texty: FUNDLY_I18N.extend, jmenný prostor "tools" (en + cs; ostatní jazyky → angličtina, sk → čeština).
   Matematika je v ToolsMath (bez DOM) — node ji může načíst přes require() kvůli testům. */
(function () {
  "use strict";

  // ---------- matematika (čisté funkce) ----------
  const ToolsMath = {
    // "2,10" i "2.10" → 2.1; prázdné/neplatné → NaN
    parseNum(v) {
      if (typeof v === "number") return v;
      const s = String(v ?? "").trim().replace(/\s+/g, "").replace(",", ".");
      if (!s || !/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
      return Number(s);
    },
    validOdds(o) { return Number.isFinite(o) && o > 1; },
    validPct(p) { return Number.isFinite(p) && p > 0 && p < 100; },
    // kurz → implikovaná pravděpodobnost v %
    impliedPct(odds) { return ToolsMath.validOdds(odds) ? 100 / odds : NaN; },
    // pravděpodobnost v % → férový kurz
    oddsFromPct(pct) { return Number.isFinite(pct) && pct > 0 && pct <= 100 ? 100 / pct : NaN; },
    // marže 2/3-cestného trhu z jeho kurzů
    margin(oddsList) {
      if (!oddsList.length || !oddsList.every(ToolsMath.validOdds)) return null;
      const sum = oddsList.reduce((a, o) => a + 1 / o, 0);
      return {
        bookPct: sum * 100, // součet implikovaných pravděpodobností
        marginPct: (sum - 1) * 100, // overround
        fairOdds: oddsList.map((o) => o * sum),
        fairPct: oddsList.map((o) => 100 / (o * sum)),
      };
    },
    // očekávaná hodnota v % vkladu: p × kurz − 1
    evPct(pct, odds) {
      if (!ToolsMath.validPct(pct) || !ToolsMath.validOdds(odds)) return NaN;
      return ((pct / 100) * odds - 1) * 100;
    },
    // plný Kelly jako podíl kapitálu (může vyjít záporně = žádná výhoda)
    kellyFraction(pct, odds) {
      if (!ToolsMath.validPct(pct) || !ToolsMath.validOdds(odds)) return NaN;
      const p = pct / 100;
      const b = odds - 1;
      return (b * p - (1 - p)) / b;
    },
    // plný / poloviční / čtvrtinový Kelly → vklad, oříznutý na max. vklad Fundly
    kellyStakes(pct, odds, capital, maxStake) {
      const f = ToolsMath.kellyFraction(pct, odds);
      if (!Number.isFinite(f) || !(capital > 0)) return null;
      return [["full", 1], ["half", 0.5], ["quarter", 0.25]].map(([key, mult]) => {
        const frac = Math.max(0, f * mult);
        const stake = frac * capital;
        const capped = Number.isFinite(maxStake) && maxStake >= 0 && stake > maxStake;
        return { key, mult, frac, stake, capped, finalStake: capped ? maxStake : stake };
      });
    },
    // kombinovaný tip: celkový kurz, implikovaná pravděpodobnost, návratnost
    combo(oddsList, stake) {
      if (!oddsList.length || !oddsList.every(ToolsMath.validOdds)) return null;
      const total = oddsList.reduce((a, o) => a * o, 1);
      const s = Number.isFinite(stake) && stake > 0 ? stake : NaN;
      return { total, impliedPct: 100 / total, ret: s * total, profit: s * total - s };
    },
  };

  if (typeof module === "object" && module.exports) module.exports = ToolsMath;
  if (typeof document === "undefined") return; // node (testy): jen matematika

  // ---------- texty ----------
  const I18N = typeof FUNDLY_I18N !== "undefined" ? FUNDLY_I18N : null;
  if (I18N) {
    I18N.extend("en", { tools: {
      nav: "Tools", title: "Tools",
      sub: "Odds calculators and your tip journal. Everything is calculated right in your browser.",
      tabCalc: "Calculators", tabJournal: "Tip journal",
      disclaimer: "The calculators are a learning aid. The results are not a recommendation and not a guarantee.",
      odds: "Odds", oddsN: "Odds {n}", prob: "Probability (%)",
      impl: {
        title: "Implied probability",
        fromOdds: "Odds → probability", fromProb: "Probability → odds",
        implied: "Implied probability", fairOdds: "Matching odds",
        marginTitle: "Market margin (overround)", ways2: "2 outcomes", ways3: "3 outcomes (1X2)",
        book: "Sum of probabilities", margin: "Bookmaker margin", fair: "Fair odds without the margin",
        explain: "Implied probability = 1 ÷ odds, so odds of 2.00 mean 50 %. Add up the probabilities of every outcome in one market and you get more than 100 % — the difference is the bookmaker's margin. The fair odds show what the market would look like without it.",
      },
      value: {
        title: "Value check", myProb: "My estimated probability (%)",
        ev: "Expected value (EV)", implied: "Probability implied by the odds", myFair: "Fair odds by your estimate",
        yes: "Value", no: "No value",
        yesD: "Your estimate is higher than the probability built into the odds.",
        noD: "The odds don't offer more than your estimate of the chance is worth.",
        explain: "EV = probability × odds − 1. A positive EV means tips like this would come out ahead over many repetitions — but only if your estimate is accurate. A single tip can end either way; value is a long-run edge, not a certainty.",
      },
      kelly: {
        title: "Stake size (Kelly)", capital: "Capital ($)",
        prefilled: "Pre-filled with your current account balance.",
        variant: "Variant", pctCap: "% of capital", stake: "Stake", afterCap: "After Fundly limit",
        full: "Full Kelly", half: "Half Kelly", quarter: "Quarter Kelly",
        cap: "Fundly max. stake: {max} (1.5 % of your account capital {cap})",
        capManual: "Fundly max. stake: {max} (1.5 % of the capital entered)",
        capped: "Fundly limit", noEdge: "With this estimate and these odds Kelly comes out at 0 — the odds give you no edge.",
        explain: "The Kelly criterion works out what share of your capital to put in so it grows as fast as possible over the long run — assuming your probability estimate is accurate. It rarely is, which is why most people use half or a quarter of it. Treat the result as a guide, not a recommendation.",
      },
      combo: {
        title: "Combo (accumulator)", legN: "Selection {n}", add: "+ Add selection", remove: "Remove selection",
        max: "Up to 6 selections.", stake: "Stake ($)",
        total: "Total odds", implied: "Implied probability", ret: "Potential return", profit: "Net profit",
        explain: "The total odds are the product of all selections' odds, and the tip only lands if every selection does. Each extra selection raises the potential return, but the probability drops fast — and the bookmaker's margin multiplies too.",
      },
    } });
    I18N.extend("cs", { tools: {
      nav: "Nástroje", title: "Nástroje",
      sub: "Kalkulačky pro práci s kurzy a deník tvých tipů. Vše se počítá přímo v prohlížeči.",
      tabCalc: "Kalkulačky", tabJournal: "Deník tipů",
      disclaimer: "Kalkulačky slouží k učení a orientaci. Výsledky nejsou doporučení ani záruka.",
      odds: "Kurz", oddsN: "Kurz {n}", prob: "Pravděpodobnost (%)",
      impl: {
        title: "Implikovaná pravděpodobnost",
        fromOdds: "Kurz → pravděpodobnost", fromProb: "Pravděpodobnost → kurz",
        implied: "Implikovaná pravděpodobnost", fairOdds: "Odpovídající kurz",
        marginTitle: "Marže trhu (overround)", ways2: "2 výsledky", ways3: "3 výsledky (1X2)",
        book: "Součet pravděpodobností", margin: "Marže bookmakera", fair: "Férové kurzy bez marže",
        explain: "Implikovaná pravděpodobnost = 1 ÷ kurz, takže kurz 2,00 odpovídá 50 %. Když sečteš pravděpodobnosti všech výsledků jednoho trhu, vyjde víc než 100 % — rozdíl je marže bookmakera. Férové kurzy ukazují, jak by trh vypadal bez ní.",
      },
      value: {
        title: "Kontrola value", myProb: "Můj odhad pravděpodobnosti (%)",
        ev: "Očekávaná hodnota (EV)", implied: "Pravděpodobnost podle kurzu", myFair: "Férový kurz podle tvého odhadu",
        yes: "Value", no: "Bez value",
        yesD: "Tvůj odhad je vyšší než pravděpodobnost, kterou naznačuje kurz.",
        noD: "Kurz nenabízí víc, než kolik podle tvého odhadu odpovídá šanci.",
        explain: "EV = pravděpodobnost × kurz − 1. Kladná EV znamená, že by ti tipy tohoto typu při mnoha opakováních dlouhodobě přinášely zisk — ale jen pokud je tvůj odhad přesný. Jednotlivý tip může dopadnout jakkoli; value je dlouhodobá výhoda, ne jistota.",
      },
      kelly: {
        title: "Velikost vkladu (Kelly)", capital: "Kapitál ($)",
        prefilled: "Předvyplněno aktuálním zůstatkem účtu.",
        variant: "Varianta", pctCap: "% kapitálu", stake: "Vklad", afterCap: "Po limitu Fundly",
        full: "Plný Kelly", half: "Poloviční Kelly", quarter: "Čtvrtinový Kelly",
        cap: "Max. vklad na Fundly: {max} (1,5 % kapitálu účtu {cap})",
        capManual: "Max. vklad na Fundly: {max} (1,5 % zadaného kapitálu)",
        capped: "limit Fundly", noEdge: "Při tomto odhadu a kurzu vychází Kelly na 0 — kurz ti nenabízí žádnou výhodu.",
        explain: "Kellyho kritérium počítá, jakou část kapitálu vložit, aby kapitál dlouhodobě rostl co nejrychleji — za předpokladu, že je tvůj odhad pravděpodobnosti přesný. To málokdy platí, proto se běžně používá polovina nebo čtvrtina. Ber výsledek jako vodítko, ne jako doporučení.",
      },
      combo: {
        title: "Kombinovaný tip (AKU)", legN: "Výběr {n}", add: "+ Přidat výběr", remove: "Odebrat výběr",
        max: "Nejvýše 6 výběrů.", stake: "Vklad ($)",
        total: "Celkový kurz", implied: "Implikovaná pravděpodobnost", ret: "Možná návratnost", profit: "Čistý zisk",
        explain: "Celkový kurz je součin kurzů všech výběrů a tip vyjde, jen když vyjdou všechny. S každým dalším výběrem roste možná návratnost, ale pravděpodobnost rychle klesá — a násobí se i marže bookmakera.",
      },
    } });
  }

  // Zjednodušený výběr: 4 otázky místo 4 kalkulaček pod sebou; vysvětlení schované v "Jak to funguje?"
  if (I18N) {
    I18N.extend("en", { tools: {
      sub: "Four quick calculators. Pick a question — the answer updates as you type.",
      howItWorks: "How does it work?", advanced: "Advanced: bookmaker margin", allVariants: "All variants",
      pick: {
        impl: "What chance do the odds give?", implD: "Odds → probability",
        value: "Is the tip worth it?", valueD: "Your estimate vs. the odds",
        kelly: "How much to enter?", kellyD: "Entry size by your edge",
        combo: "What does a combo return?", comboD: "Total odds and return",
      },
      kellySafe: "Cautious variant (¼ Kelly)",
    } });
    I18N.extend("cs", { tools: {
      sub: "Čtyři rychlé kalkulačky. Vyber otázku — výsledek se mění, jak píšeš.",
      howItWorks: "Jak to funguje?", advanced: "Pro pokročilé: marže bookmakera", allVariants: "Všechny varianty",
      pick: {
        impl: "Jakou šanci dává kurz?", implD: "Kurz → pravděpodobnost",
        value: "Vyplatí se tip?", valueD: "Tvůj odhad vs. kurz",
        kelly: "Kolik vložit?", kellyD: "Vklad podle tvé výhody",
        combo: "Kolik vrátí kombinace?", comboD: "Celkový kurz a návratnost",
      },
      kellySafe: "Opatrná varianta (¼ Kelly)",
    } });
  }
  const T = (k) => (I18N ? I18N.t(`tools.${k}`) : k);
  const TF = (k, vars) => (I18N ? I18N.tf(`tools.${k}`, vars) : k);
  const lang = () => (I18N ? I18N.getLang() : "en");
  const locale = () => ({ cs: "cs-CZ", sk: "sk-SK", pl: "pl-PL", hu: "hu-HU", es: "es-ES" }[lang()] || "en-US");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
  // en: "50.0%", cs a další: "50,0 %"
  const pct = (n, d = 1) => (Number.isFinite(n) ? num(n, d) + (lang() === "en" ? "%" : " %") : "—");
  const signedPct = (n, d = 1) => (Number.isFinite(n) ? (n > 0 ? "+" : n < 0 ? "−" : "") + pct(Math.abs(n), d) : "—");
  const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "—");
  const usd2 = (n) => (Number.isFinite(n) ? "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—");
  const P = ToolsMath.parseNum;

  // ---------- stav (přežije překreslení i přepnutí jazyka) ----------
  const S = {
    tab: "calc",
    tool: "impl", // vybraná kalkulačka: impl | value | kelly | combo
    o2p: "2.00", p2o: "50",
    ways: 2, mk: ["1.90", "1.90", "3.40"],
    vProb: "55", vOdds: "2.00",
    kProb: "55", kOdds: "2.00", kCap: "", kCapTouched: false,
    legs: ["1.80", "2.10", "", "", "", ""], legCount: 2, cStake: "20",
  };

  // max. vklad Fundly: 1,5 % kapitálu balíčku (Portfolio.ruleMeta), bez účtu 1,5 % zadaného kapitálu
  function accountInfo() {
    try {
      if (typeof Portfolio === "undefined" || window.__noRealAccount) return null;
      const st = Portfolio.get();
      if (!st) return null;
      return { balance: Number(st.balance), cap: Number(st.cap), maxStake: Number(Portfolio.ruleMeta(st).maxStake) };
    } catch (e) { return null; }
  }

  const field = (key, label, value, opts = {}) => `
    <div class="field">
      <label for="tl-${key}">${esc(label)}</label>
      <input class="input" id="tl-${key}" data-tl="${key}" type="text" inputmode="decimal" autocomplete="off" value="${esc(value)}"${opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : ""} />
    </div>`;
  const out = (id, label) => `<div class="tl-out"><span>${esc(label)}</span><b id="${id}">—</b></div>`;

  function calcHtml() {
    const mkFields = Array.from({ length: S.ways }, (_, i) => field(`mk${i}`, TF("oddsN", { n: i + 1 }), S.mk[i])).join("");
    const legs = Array.from({ length: S.legCount }, (_, i) => `
      <div class="tl-leg">
        ${field(`leg${i}`, TF("combo.legN", { n: i + 1 }), S.legs[i])}
        ${S.legCount > 1 ? `<button type="button" class="tl-leg-x" data-tl-rmleg="${i}" aria-label="${esc(T("combo.remove"))}"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>` : ""}
      </div>`).join("");
    const more = (key) => `<details class="tl-more"><summary>${esc(T("howItWorks"))}</summary><p>${esc(T(key))}</p></details>`;
    const cards = {
      impl: `
        <div class="tl-row">${field("o2p", T("odds"), S.o2p)}${out("tlO2p", T("impl.implied"))}</div>
        <div class="tl-row">${field("p2o", T("prob"), S.p2o)}${out("tlP2o", T("impl.fairOdds"))}</div>
        <details class="tl-more"><summary>${esc(T("advanced"))}</summary>
          <div class="tl-seg" role="group" aria-label="${esc(T("impl.marginTitle"))}">
            <button type="button" data-tl-ways="2" aria-pressed="${S.ways === 2}">${esc(T("impl.ways2"))}</button>
            <button type="button" data-tl-ways="3" aria-pressed="${S.ways === 3}">${esc(T("impl.ways3"))}</button>
          </div>
          <div class="tl-fields tl-fields-${S.ways}">${mkFields}</div>
          ${out("tlBook", T("impl.book"))}
          ${out("tlMargin", T("impl.margin"))}
          ${out("tlFair", T("impl.fair"))}
        </details>
        ${more("impl.explain")}`,
      value: `
        <div class="tl-fields tl-fields-2">${field("vProb", T("value.myProb"), S.vProb)}${field("vOdds", T("odds"), S.vOdds)}</div>
        <div class="tl-verdict" id="tlVerdict" hidden></div>
        ${out("tlEv", T("value.ev"))}
        ${out("tlVImpl", T("value.implied"))}
        ${out("tlVFair", T("value.myFair"))}
        ${more("value.explain")}`,
      kelly: `
        <div class="tl-fields tl-fields-3">${field("kProb", T("value.myProb"), S.kProb)}${field("kOdds", T("odds"), S.kOdds)}${field("kCap", T("kelly.capital"), S.kCap)}</div>
        <p class="t-meta tl-prefilled" id="tlKPrefilled" hidden>${esc(T("kelly.prefilled"))}</p>
        <div class="tl-big"><span>${esc(T("kellySafe"))}</span><b id="tlKSafe">—</b></div>
        <div class="tl-cap" id="tlKCap"></div>
        <p class="t-meta" id="tlKNoEdge" hidden>${esc(T("kelly.noEdge"))}</p>
        <details class="tl-more"><summary>${esc(T("allVariants"))}</summary>
          <div class="tl-table-wrap">
            <table class="ticket-table tl-table">
              <thead><tr><th>${esc(T("kelly.variant"))}</th><th>${esc(T("kelly.pctCap"))}</th><th>${esc(T("kelly.stake"))}</th><th>${esc(T("kelly.afterCap"))}</th></tr></thead>
              <tbody id="tlKelly"></tbody>
            </table>
          </div>
        </details>
        ${more("kelly.explain")}`,
      combo: `
        <div class="tl-legs">${legs}</div>
        <div class="tl-leg-actions">
          ${S.legCount < 6 ? `<button type="button" class="filter-chip" data-tl-addleg>${esc(T("combo.add"))}</button>` : `<span class="t-meta">${esc(T("combo.max"))}</span>`}
        </div>
        ${field("cStake", T("combo.stake"), S.cStake)}
        ${out("tlCTotal", T("combo.total"))}
        ${out("tlCRet", T("combo.ret"))}
        ${out("tlCProfit", T("combo.profit"))}
        ${out("tlCImpl", T("combo.implied"))}
        ${more("combo.explain")}`,
    };
    const icons = {
      impl: '<path d="M3 13L13 3M4.5 5.5a1 1 0 100-2 1 1 0 000 2zM11.5 12.5a1 1 0 100-2 1 1 0 000 2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      value: '<path d="M2.5 8.5l3 3 8-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
      kelly: '<rect x="2" y="4" width="12" height="8.5" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8.25" r="1.8" stroke="currentColor" stroke-width="1.5"/>',
      combo: '<path d="M3 4h4v4H3zM9 8h4v4H9zM7 6h3v2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
    };
    const picker = ["impl", "value", "kelly", "combo"].map((k) => `
      <button type="button" class="tl-pick${S.tool === k ? " active" : ""}" data-tl-tool="${k}" aria-pressed="${S.tool === k}">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">${icons[k]}</svg>
        <span><b>${esc(T(`pick.${k}`))}</b><small>${esc(T(`pick.${k}D`))}</small></span>
      </button>`).join("");
    return `
      <div class="tl-picker" role="group">${picker}</div>
      <div class="panel tl-card tl-one">
        <h3>${esc(T(`pick.${S.tool}`))}</h3>
        ${cards[S.tool]}
      </div>
      <p class="t-meta tl-disclaimer">${esc(T("disclaimer"))}</p>`;
  }

  const setOut = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };

  // přepočet výsledků bez překreslení polí (fokus a kurzor zůstanou)
  function updateOutputs() {
    // implikovaná pravděpodobnost
    setOut("tlO2p", esc(pct(ToolsMath.impliedPct(P(S.o2p)), 2)));
    setOut("tlP2o", esc(num(ToolsMath.oddsFromPct(P(S.p2o)), 2)));
    const mg = ToolsMath.margin(S.mk.slice(0, S.ways).map(P));
    setOut("tlBook", esc(mg ? pct(mg.bookPct, 2) : "—"));
    setOut("tlMargin", esc(mg ? pct(mg.marginPct, 2) : "—"));
    setOut("tlFair", mg ? mg.fairOdds.map((o, i) => `<span class="tl-fair">${esc(num(o, 2))} <small>${esc(pct(mg.fairPct[i], 1))}</small></span>`).join("") : "—");

    // value
    const vp = P(S.vProb), vo = P(S.vOdds);
    const ev = ToolsMath.evPct(vp, vo);
    setOut("tlEv", Number.isFinite(ev) ? `<span class="${ev > 0 ? "green" : ev < 0 ? "red" : ""}">${esc(signedPct(ev, 2))}</span>` : "—");
    setOut("tlVImpl", esc(pct(ToolsMath.impliedPct(vo), 2)));
    setOut("tlVFair", esc(ToolsMath.validPct(vp) ? num(ToolsMath.oddsFromPct(vp), 2) : "—"));
    const verdict = document.getElementById("tlVerdict");
    if (verdict) {
      verdict.hidden = !Number.isFinite(ev);
      if (Number.isFinite(ev)) {
        const yes = ev > 0;
        verdict.className = `tl-verdict ${yes ? "yes" : "no"}`;
        verdict.innerHTML = `<b>${esc(T(yes ? "value.yes" : "value.no"))}</b><span>${esc(T(yes ? "value.yesD" : "value.noD"))}</span>`;
      }
    }

    // Kelly
    const acc = accountInfo();
    if (acc && !S.kCapTouched && Number.isFinite(acc.balance)) {
      S.kCap = String(Math.round(acc.balance));
      const capInput = document.getElementById("tl-kCap");
      if (capInput && capInput.value !== S.kCap) capInput.value = S.kCap;
    }
    const prefilled = document.getElementById("tlKPrefilled");
    if (prefilled) prefilled.hidden = !(acc && !S.kCapTouched);
    const cap = P(S.kCap);
    const maxStake = acc && Number.isFinite(acc.maxStake) ? acc.maxStake : (cap > 0 ? Math.round(cap * 0.015) : NaN);
    setOut("tlKCap", Number.isFinite(maxStake)
      ? esc(acc ? TF("kelly.cap", { max: usd(maxStake), cap: usd(acc.cap) }) : TF("kelly.capManual", { max: usd(maxStake) }))
      : "");
    const rows = ToolsMath.kellyStakes(P(S.kProb), P(S.kOdds), cap, maxStake);
    setOut("tlKelly", rows ? rows.map((r) => `
      <tr>
        <td>${esc(T(`kelly.${r.key}`))}</td>
        <td class="odds">${esc(pct(r.frac * 100, 2))}</td>
        <td class="odds">${esc(usd(r.stake))}</td>
        <td class="odds"><b>${esc(usd(r.finalStake))}</b>${r.capped ? ` <span class="tl-tag-capped">${esc(T("kelly.capped"))}</span>` : ""}</td>
      </tr>`).join("") : `<tr><td colspan="4" class="t-meta">—</td></tr>`);
    const safe = rows && rows.find((r) => r.key === "quarter");
    setOut("tlKSafe", safe ? `${esc(usd(safe.finalStake))}${safe.capped ? ` <span class="tl-tag-capped">${esc(T("kelly.capped"))}</span>` : ""}` : "—");
    const noEdge = document.getElementById("tlKNoEdge");
    if (noEdge) noEdge.hidden = !(rows && rows[0].frac <= 0);

    // kombinovaný tip
    const cb = ToolsMath.combo(S.legs.slice(0, S.legCount).map(P), P(S.cStake));
    setOut("tlCTotal", esc(cb ? num(cb.total, 2) : "—"));
    setOut("tlCImpl", esc(cb ? pct(cb.impliedPct, 2) : "—"));
    setOut("tlCRet", cb && Number.isFinite(cb.ret) ? `<span class="green">${esc(usd2(cb.ret))}</span>` : "—");
    setOut("tlCProfit", esc(cb && Number.isFinite(cb.profit) ? usd2(cb.profit) : "—"));
  }

  function renderCalc() {
    const root = document.getElementById("toolsCalc");
    if (!root) return;
    root.innerHTML = calcHtml();
    updateOutputs();
  }

  function setTab(tab) {
    S.tab = tab === "journal" ? "journal" : "calc";
    document.querySelectorAll("#toolsTabs [data-tools-tab]").forEach((b) => {
      const on = b.dataset.toolsTab === S.tab;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    const calc = document.getElementById("toolsCalc");
    const journal = document.getElementById("toolsJournal");
    if (calc) calc.hidden = S.tab !== "calc";
    if (journal) journal.hidden = S.tab !== "journal";
    if (S.tab === "journal" && window.FundlyJournal) window.FundlyJournal.render(journal);
  }

  // volá showView("nastroje") v js/dashboard.js
  function onShow() {
    if (!document.getElementById("toolsCalc")?.childElementCount) renderCalc();
    else updateOutputs(); // čerstvý zůstatek do Kelly
    setTab(S.tab);
  }

  // ---------- události ----------
  document.addEventListener("input", (e) => {
    const key = e.target?.dataset?.tl;
    if (!key) return;
    const v = e.target.value;
    if (/^mk\d$/.test(key)) S.mk[Number(key.slice(2))] = v;
    else if (/^leg\d$/.test(key)) S.legs[Number(key.slice(3))] = v;
    else {
      S[key] = v;
      if (key === "kCap") S.kCapTouched = true;
    }
    updateOutputs();
  });

  document.addEventListener("click", (e) => {
    const tab = e.target.closest("[data-tools-tab]");
    if (tab) { setTab(tab.dataset.toolsTab); return; }
    const tool = e.target.closest("[data-tl-tool]");
    if (tool) { S.tool = tool.dataset.tlTool; renderCalc(); return; }
    const ways = e.target.closest("[data-tl-ways]");
    if (ways) { S.ways = Number(ways.dataset.tlWays) === 3 ? 3 : 2; renderCalc(); return; }
    if (e.target.closest("[data-tl-addleg]")) {
      if (S.legCount < 6) S.legCount += 1;
      renderCalc();
      document.getElementById(`tl-leg${S.legCount - 1}`)?.focus();
      return;
    }
    const rm = e.target.closest("[data-tl-rmleg]");
    if (rm && S.legCount > 1) {
      const i = Number(rm.dataset.tlRmleg);
      S.legs.splice(i, 1);
      S.legs.push("");
      S.legCount -= 1;
      renderCalc();
    }
  });

  // statické texty s klíči tools.* / journal.*: i18n.js je přeložil dřív, než
  // tenhle slovník existoval — doplnit hned (další přepnutí jazyka už zvládne i18n.js)
  function applyStatic() {
    if (!I18N) return;
    document.querySelectorAll('[data-i18n^="tools."], [data-i18n^="journal."]').forEach((el) => {
      el.textContent = I18N.t(el.getAttribute("data-i18n"));
    });
  }
  applyStatic();

  document.addEventListener("fundly:lang-changed", () => {
    const root = document.getElementById("toolsCalc");
    if (root && root.childElementCount) renderCalc();
    const view = document.getElementById("view-nastroje");
    if (view && !view.hidden) setTab(S.tab);
  });

  window.FundlyTools = { math: ToolsMath, onShow, render: renderCalc };
})();
