/* Fundly — jazyk právních a statických stránek (terms, privacy, rules, refund, aml, disclaimer,
   restricted-countries, unsubscribe, offline). Stránka obsahuje anglický i český text:
     <div class="container legal-wrap" data-lang="en"> … </div>
     <div class="container legal-wrap" data-lang="cs" lang="cs" hidden data-title="…"> … </div>
   Tady se podle zvoleného jazyka (fundly:lang, ?lang=, jazyk prohlížeče) ukáže správná verze,
   přeloží se hlavička a patička (prvky s data-legal="klíč") a přidá se přepínač EN / CS.
   Slovenština zobrazí českou verzi (bližší než angličtina). Nezávislé na js/i18n.js. */
(function () {
  const KEY = "fundly:lang";
  const CHROME = {
    cs: {
      back: "Zpět na hlavní stránku",
      brand: "Profesionální hodnoticí platforma pro sportovní analytiky. Až $100 000 simulovaného kapitálu a 80 % podíl z výkonu.",
      packages: "Balíčky",
      info: "Informace",
      how: "Jak to funguje",
      why: "Proč Fundly",
      faq: "Časté dotazy",
      support: "Podpora",
      contact: "Kontaktujte nás",
      telegram: "Chat na Telegramu",
      status: "Stav služby",
      disclaimer: "Právní upozornění: Fundly.games provozuje společnost Fundly s.r.o. (Čenětická 2413/1a, 149 00 Praha 4, Česká republika, IČO 30237246). Fundly Games není sázková kancelář, provozovatel hazardních her ani finanční instituce. Všechny služby, hodnoticí výzvy a metriky na této platformě slouží výhradně ke vzdělávacím a analytickým simulačním účelům a používají virtuální kredity s nulovou peněžní hodnotou. Poplatky za výzvy pokrývají licenci softwaru, vyhodnocování dat a přístup k analytické platformě.",
      rights: "© 2026 Fundly. Všechna práva vyhrazena.",
      privacy: "Soukromí",
      terms: "Podmínky",
      rules: "Pravidla",
      disc: "Upozornění",
      refund: "Vrácení peněz",
      aml: "Zásady AML",
      restricted: "Vyloučené země",
    },
  };

  function pick() {
    let lang = null;
    try {
      const url = new URLSearchParams(location.search).get("lang");
      if (url) { localStorage.setItem(KEY, url); lang = url; }
      if (!lang) lang = localStorage.getItem(KEY);
    } catch (e) { /* úložiště zakázané */ }
    if (!lang) lang = (navigator.language || "en").slice(0, 2).toLowerCase();
    return lang;
  }

  function apply(lang) {
    const want = lang === "cs" || lang === "sk" ? "cs" : "en";
    const hasBlocks = !!document.querySelector(".legal-wrap[data-lang]");
    const hasCs = !!document.querySelector('.legal-wrap[data-lang="cs"]');
    // stránka bez jazykových bloků (unsubscribe): přeložit aspoň hlavičku/patičku podle jazyka
    const show = want === "cs" && (hasCs || !hasBlocks) ? "cs" : "en";
    document.querySelectorAll(".legal-wrap[data-lang]").forEach((el) => { el.hidden = el.dataset.lang !== show; });
    if (hasBlocks) document.documentElement.lang = show;
    const block = document.querySelector(`.legal-wrap[data-lang="${show}"]`);
    if (!document.documentElement.dataset.titleEn) document.documentElement.dataset.titleEn = document.title;
    if (hasBlocks) document.title = show === "cs" && block && block.dataset.title ? block.dataset.title : document.documentElement.dataset.titleEn;
    document.querySelectorAll("[data-legal]").forEach((el) => {
      if (el.dataset.legalEn === undefined) el.dataset.legalEn = el.textContent;
      const tr = CHROME[show] && CHROME[show][el.dataset.legal];
      el.textContent = tr || el.dataset.legalEn;
    });
    document.querySelectorAll(".legal-lang-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === show)));
  }

  function init() {
    const cta = document.querySelector(".nav .nav-cta");
    if (cta && document.querySelector('.legal-wrap[data-lang="cs"]') && !document.querySelector(".legal-lang")) {
      const sw = document.createElement("div");
      sw.className = "legal-lang";
      sw.setAttribute("role", "group");
      sw.setAttribute("aria-label", "Language");
      sw.innerHTML = '<button type="button" class="legal-lang-btn" data-lang="en">EN</button><button type="button" class="legal-lang-btn" data-lang="cs">CS</button>';
      sw.addEventListener("click", (e) => {
        const b = e.target.closest(".legal-lang-btn");
        if (!b) return;
        try { localStorage.setItem(KEY, b.dataset.lang); } catch (err) { /* */ }
        apply(b.dataset.lang);
      });
      cta.prepend(sw);
    }
    apply(pick());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
