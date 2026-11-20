/* Fundly — ověřovací stránka certifikátu (certificate.html?id=FC-XXXXXX).
   Čte veřejnou funkci certificate_get (migrace 039) s anon klíčem z js/config.js —
   vrací jen nezrušený certifikát a jen veřejné údaje (jméno, balíček, datum, statistiky).
   Samostatné texty EN/CS (cs i pro sk), nezávislé na js/i18n.js — stejně jako js/legal-lang.js. */
(function () {
  "use strict";
  const KEY = "fundly:lang";
  const STR = {
    en: {
      back: "Back to home",
      heading: "Certificate verification",
      sub: "Check that a Fundly Certified Analyst certificate is genuine.",
      loading: "Checking the certificate…",
      verified: "Verified ✓",
      kind: "Passed both evaluation phases of the Fundly Challenge (Phase 1 and Phase 2) with disciplined risk management.",
      package: "Package", capital: "Simulated capital", date: "Date passed", issued: "Issued",
      tips: "Tips", winRate: "Win rate", profit: "Profit (% of capital)", avgOdds: "Average odds",
      phaseLine: "Phase {n}: {tips} tips · win rate {win} · profit {profit}",
      note: "Simulated evaluation using virtual credits with no monetary value.",
      cta: "Start your own Fundly Challenge",
      notFound: "Certificate not found",
      notFoundText: "No valid certificate matches this ID. Check the ID on the certificate (e.g. FC-7K3M9Q) and try again.",
      enterTitle: "Verify a certificate",
      enterText: "Enter the certificate ID printed on the certificate (e.g. FC-7K3M9Q).",
      errorText: "The certificate couldn't be checked right now. Please try again in a moment.",
      idLabel: "Certificate ID",
      check: "Verify",
      title: "Certificate verification | Fundly",
      brand: "A professional evaluation platform for sports analysts. Up to $100,000 in simulated capital and an 80 % performance split.",
      packages: "Packages", info: "Information", how: "How it works", why: "Why Fundly", faq: "FAQ",
      support: "Support", contact: "Contact us", telegram: "Chat on Telegram", status: "Service status",
      disclaimer: null, rights: null, privacy: "Privacy", terms: "Terms", rules: "Rules", disc: "Disclaimer",
      refund: "Refund", aml: "AML Policy", restricted: "Restricted Countries", cookies: "Cookies",
    },
    cs: {
      back: "Zpět na hlavní stránku",
      heading: "Ověření certifikátu",
      sub: "Ověř, že certifikát Fundly Certified Analyst je pravý.",
      loading: "Ověřuji certifikát…",
      verified: "Ověřeno ✓",
      kind: "Úspěšně splněny obě hodnoticí fáze výzvy Fundly Challenge (Fáze 1 a Fáze 2) s disciplinovaným řízením rizika.",
      package: "Balíček", capital: "Simulovaný kapitál", date: "Datum splnění", issued: "Vystaveno",
      tips: "Tipy", winRate: "Úspěšnost", profit: "Zisk (% kapitálu)", avgOdds: "Průměrný kurz",
      phaseLine: "Fáze {n}: tipy {tips} · úspěšnost {win} · zisk {profit}",
      note: "Simulované hodnocení s virtuálními kredity bez peněžní hodnoty.",
      cta: "Začni vlastní Fundly Challenge",
      notFound: "Certifikát nenalezen",
      notFoundText: "K tomuto ID neexistuje žádný platný certifikát. Zkontroluj ID uvedené na certifikátu (např. FC-7K3M9Q) a zkus to znovu.",
      enterTitle: "Ověřit certifikát",
      enterText: "Zadej ID certifikátu, které je na něm vytištěné (např. FC-7K3M9Q).",
      errorText: "Certifikát se teď nepodařilo ověřit. Zkus to prosím za chvíli znovu.",
      idLabel: "ID certifikátu",
      check: "Ověřit",
      title: "Ověření certifikátu | Fundly",
      brand: "Profesionální hodnoticí platforma pro sportovní analytiky. Až $100 000 simulovaného kapitálu a 80 % podíl z výkonu.",
      packages: "Balíčky", info: "Informace", how: "Jak to funguje", why: "Proč Fundly", faq: "Časté dotazy",
      support: "Podpora", contact: "Kontaktujte nás", telegram: "Chat na Telegramu", status: "Stav služby",
      disclaimer: "Právní upozornění: Fundly.games provozuje společnost Fundly s.r.o. (Čenětická 2413/1a, 149 00 Praha 4, Česká republika, IČO 30237246). Fundly Games není sázková kancelář, provozovatel hazardních her ani finanční instituce. Všechny služby, hodnoticí výzvy a metriky na této platformě slouží výhradně ke vzdělávacím a analytickým simulačním účelům a používají virtuální kredity s nulovou peněžní hodnotou. Poplatky za výzvy pokrývají licenci softwaru, vyhodnocování dat a přístup k analytické platformě.",
      rights: "© 2026 Fundly. Všechna práva vyhrazena.",
      privacy: "Soukromí", terms: "Podmínky", rules: "Pravidla", disc: "Upozornění",
      refund: "Vrácení peněz", aml: "Zásady AML", restricted: "Vyloučené země", cookies: "Cookies",
    },
  };
  const PKG = { starter: "Starter", standard: "Standard", advanced: "Advanced", pro: "Pro", elite: "Elite" };

  let lang = "en";
  let cert = null;
  let state = "loading"; // loading | found | missing | enter | error

  function pickLang() {
    let l = null;
    try {
      const url = new URLSearchParams(location.search).get("lang");
      if (url) { localStorage.setItem(KEY, url); l = url; }
      if (!l) l = localStorage.getItem(KEY);
    } catch (e) { /* úložiště zakázané */ }
    if (!l) l = (navigator.language || "en").slice(0, 2).toLowerCase();
    return l === "cs" || l === "sk" ? "cs" : "en";
  }

  const $ = (id) => document.getElementById(id);
  const S = (k) => STR[lang][k];
  function num(n, d) {
    return new Intl.NumberFormat(lang === "cs" ? "cs-CZ" : "en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
      .format(Number(n) || 0).replace(/[   ]/g, " ");
  }
  const pct = (n, sign) => (n == null ? "–" : (sign && Number(n) > 0 ? "+" : "") + num(n, 1) + " %");
  function date(iso) {
    if (!iso) return "–";
    try { return new Date(iso).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return String(iso).slice(0, 10); }
  }

  function applyChrome() {
    document.documentElement.lang = lang;
    document.title = S("title");
    document.querySelectorAll("[data-cv]").forEach((el) => {
      if (el.dataset.cvEn === undefined) el.dataset.cvEn = el.textContent;
      const v = S(el.dataset.cv);
      el.textContent = v || el.dataset.cvEn;
    });
    document.querySelectorAll("[data-cv-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cvLang === lang)));
  }

  function show(which) {
    ["cvLoading", "cvFound", "cvMissing"].forEach((id) => { $(id).hidden = id !== which; });
  }

  function render() {
    applyChrome();
    if (state === "loading") { show("cvLoading"); return; }
    if (state !== "found") {
      show("cvMissing");
      $("cvMissingTitle").textContent = state === "enter" ? S("enterTitle") : S("notFound");
      $("cvMissingText").textContent = state === "enter" ? S("enterText") : state === "error" ? S("errorText") : S("notFoundText");
      return;
    }
    const s = cert.stats || {};
    $("cvId").textContent = cert.id;
    $("cvName").textContent = cert.display_name;
    $("cvPackage").textContent = PKG[cert.package_key] || cert.package_key || "–";
    $("cvCapital").textContent = "$" + num(cert.capital, 0);
    $("cvDate").textContent = date(cert.passed_at);
    $("cvIssued").textContent = date(cert.issued_at);
    $("cvTips").textContent = num(s.tips || 0, 0);
    $("cvWin").textContent = pct(s.winRate);
    $("cvProfit").textContent = pct(s.profitPct || 0, true);
    $("cvOdds").textContent = s.avgOdds == null ? "–" : num(s.avgOdds, 2);
    const ph = $("cvPhases");
    ph.textContent = "";
    if (s.phase1 && s.phase2) {
      [1, 2].forEach((n) => {
        const p = s["phase" + n];
        const li = document.createElement("li");
        li.textContent = S("phaseLine").replace("{n}", n).replace("{tips}", num(p.tips || 0, 0))
          .replace("{win}", pct(p.winRate)).replace("{profit}", pct(p.profitPct || 0, true));
        ph.appendChild(li);
      });
      ph.hidden = false;
    } else ph.hidden = true;
    show("cvFound");
  }

  async function lookup(id) {
    state = "loading";
    render();
    try {
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/rest/v1/rpc/certificate_get`, {
        method: "POST",
        headers: {
          apikey: FUNDLY_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${FUNDLY_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_id: id }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const rows = await res.json();
      cert = Array.isArray(rows) && rows.length ? rows[0] : null;
      state = cert ? "found" : "missing";
    } catch (e) {
      cert = null;
      state = "error";
    }
    render();
  }

  function normId(v) {
    const s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const core = s.startsWith("FC") ? s.slice(2) : s;
    return core.length === 6 ? `FC-${core}` : null;
  }

  function init() {
    lang = pickLang();
    document.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cv-lang]");
      if (!b) return;
      lang = b.dataset.cvLang === "cs" ? "cs" : "en";
      try { localStorage.setItem(KEY, lang); } catch (err) { /* */ }
      render();
    });
    $("cvForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = normId($("cvInput").value);
      if (!id) { state = "missing"; render(); return; }
      const url = new URL(location.href);
      url.searchParams.set("id", id);
      history.replaceState(null, "", url);
      lookup(id);
    });
    const id = normId(new URLSearchParams(location.search).get("id"));
    if (id) { $("cvInput").value = id; lookup(id); }
    else { state = new URLSearchParams(location.search).get("id") ? "missing" : "enter"; render(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
