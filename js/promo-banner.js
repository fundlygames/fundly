/* Fundly — site-wide launch promo banner, injected above the nav on every
   customer-facing page. Self-contained (doesn't depend on js/i18n.js, which
   isn't loaded on the untranslated legal pages) — reads the language the
   visitor already picked from the same localStorage key i18n.js uses.
   Mirrors js/packages.js PROMO — keep both in sync. */
(function () {
  const PROMO = { code: "NEWFUNDLY", percent: 40, endsAt: "2026-09-15T23:59:59+02:00" };
  const LANG_KEY = "fundly:lang";
  const DISMISS_KEY = "fundly:promoDismissed:" + PROMO.code + ":" + PROMO.endsAt;

  const TEXT = {
    en: { line: "Use code <span class=\"promo-code\">{code}</span> for {pct}% off any package", ends: "Ends in", d: "d", h: "h", m: "m", s: "s", close: "Dismiss" },
    cs: { line: "Použij kód <span class=\"promo-code\">{code}</span> a získej {pct}% slevu na jakýkoliv balíček", ends: "Končí za", d: "d", h: "h", m: "m", s: "s", close: "Zavřít" },
    sk: { line: "Použi kód <span class=\"promo-code\">{code}</span> a získaj {pct}% zľavu na akýkoľvek balíček", ends: "Končí o", d: "d", h: "h", m: "m", s: "s", close: "Zavrieť" },
    pl: { line: "Użyj kodu <span class=\"promo-code\">{code}</span> i zyskaj {pct}% zniżki na dowolny pakiet", ends: "Kończy się za", d: "d", h: "godz.", m: "min", s: "s", close: "Zamknij" },
    hu: { line: "Használd a(z) <span class=\"promo-code\">{code}</span> kódot {pct}% kedvezményért bármely csomagra", ends: "Lejár:", d: "n", h: "ó", m: "p", s: "mp", close: "Bezárás" },
    es: { line: "Usa el código <span class=\"promo-code\">{code}</span> y obtén {pct}% de descuento en cualquier paquete", ends: "Termina en", d: "d", h: "h", m: "m", s: "s", close: "Cerrar" },
  };

  function getLang() {
    const lang = localStorage.getItem(LANG_KEY) || document.documentElement.dataset.lang || document.documentElement.lang || "en";
    return TEXT[lang] ? lang : "en";
  }

  function updateHeight(bar) {
    document.documentElement.style.setProperty("--promo-h", bar ? bar.offsetHeight + "px" : "0px");
  }

  function init() {
    if (Date.now() >= new Date(PROMO.endsAt).getTime()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const bar = document.createElement("div");
    bar.className = "promo-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Promo");

    const lineEl = document.createElement("span");
    const timerEl = document.createElement("span");
    timerEl.className = "promo-timer";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "promo-close";
    closeBtn.textContent = "×";

    bar.appendChild(lineEl);
    bar.appendChild(timerEl);
    bar.appendChild(closeBtn);
    document.body.insertBefore(bar, document.body.firstChild);

    function render() {
      const t = TEXT[getLang()];
      lineEl.innerHTML = t.line.replace("{code}", PROMO.code).replace("{pct}", PROMO.percent);
      closeBtn.setAttribute("aria-label", t.close);
      tick(t);
      updateHeight(bar);
    }

    function tick(t) {
      const ms = new Date(PROMO.endsAt).getTime() - Date.now();
      if (ms <= 0) {
        bar.remove();
        updateHeight(null);
        clearInterval(timerId);
        return;
      }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      timerEl.textContent = "— " + t.ends + " " +
        (d > 0 ? `${d}${t.d} ${h}${t.h}` : h > 0 ? `${h}${t.h} ${m}${t.m}` : `${m}${t.m} ${s}${t.s}`);
    }

    render();
    const timerId = setInterval(() => tick(TEXT[getLang()]), 1000);
    window.addEventListener("resize", () => updateHeight(bar));
    document.addEventListener("fundly:lang-changed", render);

    closeBtn.addEventListener("click", () => {
      localStorage.setItem(DISMISS_KEY, "1");
      clearInterval(timerId);
      bar.remove();
      updateHeight(null);
    });
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
