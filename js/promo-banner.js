/* Fundly — site-wide standing promo banner (no end date), injected above
   the nav on every customer-facing page. Self-contained (doesn't depend on
   js/i18n.js, which isn't loaded on the untranslated legal pages) — reads
   the language the visitor already picked from the same localStorage key
   i18n.js uses. Mirrors js/packages.js PROMO — keep both in sync. */
(function () {
  const PROMO = { code: "NEWFUNDLY", percent: 30 };
  const LANG_KEY = "fundly:lang";
  const DISMISS_KEY = "fundly:promoDismissed:" + PROMO.code;
  // Hráč s aktivním účtem (aktivní Challenge / Partner / čeká na schválení) slevový kód
  // nepotřebuje — dashboard tenhle příznak nastaví / smaže (setActivePlayer), platí na celém webu.
  const ACTIVE_KEY = "fundly:activePlayer";
  const safeGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const safeSet = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* */ } };
  let barEl = null;

  const TEXT = {
    en: { line: "Use code <span class=\"promo-code\">{code}</span> for {pct}% off any package", close: "Dismiss" },
    cs: { line: "Použij kód <span class=\"promo-code\">{code}</span> a získej {pct}% slevu na jakýkoliv balíček", close: "Zavřít" },
    sk: { line: "Použi kód <span class=\"promo-code\">{code}</span> a získaj {pct}% zľavu na akýkoľvek balíček", close: "Zavrieť" },
    pl: { line: "Użyj kodu <span class=\"promo-code\">{code}</span> i zyskaj {pct}% zniżki na dowolny pakiet", close: "Zamknij" },
    hu: { line: "Használd a(z) <span class=\"promo-code\">{code}</span> kódot {pct}% kedvezményért bármely csomagra", close: "Bezárás" },
    es: { line: "Usa el código <span class=\"promo-code\">{code}</span> y obtén {pct}% de descuento en cualquier paquete", close: "Cerrar" },
  };

  // Pozvánka od kamaráda (?ref=KÓD, uloží js/whop.js do "fundly:ref", platí 30 dní): místo obecné
  // lišty řekne, že návštěvník má 10 % slevu navíc. Skutečnou slevu ověřuje a počítá jen server
  // (whop-checkout); NEWFUNDLY se na zlevněnou cenu uplatní také (ověřeno v pokladně Whop).
  const REF_KEY = "fundly:ref";
  const REF_TTL_MS = 30 * 24 * 3600 * 1000;
  const REF_PCT = 10;
  const REF_TEXT = {
    en: "A friend invited you: <b>{ref}% off</b> your first package — plus code <span class=\"promo-code\">{code}</span> for another {pct}%",
    cs: "Pozvánka od kamaráda: <b>{ref}% sleva</b> na první balíček — a s kódem <span class=\"promo-code\">{code}</span> dalších {pct}%",
    sk: "Pozvánka od kamaráta: <b>{ref}% zľava</b> na prvý balíček — a s kódom <span class=\"promo-code\">{code}</span> ďalších {pct}%",
    pl: "Zaproszenie od znajomego: <b>{ref}% zniżki</b> na pierwszy pakiet — a z kodem <span class=\"promo-code\">{code}</span> kolejne {pct}%",
    hu: "Egy barátod meghívott: <b>{ref}% kedvezmény</b> az első csomagra — a(z) <span class=\"promo-code\">{code}</span> kóddal további {pct}%",
    es: "Un amigo te invitó: <b>{ref}% de descuento</b> en tu primer paquete — y con el código <span class=\"promo-code\">{code}</span> otro {pct}%",
  };
  function hasReferral() {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("ref");
      if (fromUrl && /^[A-Za-z0-9]{4,16}$/.test(fromUrl.trim())) return true; // whop.js (defer) ho uloží až po nás
      const r = JSON.parse(safeGet(REF_KEY) || "null");
      return !!(r && r.code && Date.now() - (r.at || 0) <= REF_TTL_MS);
    } catch (e) { return false; }
  }

  function getLang() {
    const lang = localStorage.getItem(LANG_KEY) || document.documentElement.dataset.lang || document.documentElement.lang || "en";
    return TEXT[lang] ? lang : "en";
  }

  function updateHeight(bar) {
    document.documentElement.style.setProperty("--promo-h", bar ? bar.offsetHeight + "px" : "0px");
  }

  function init() {
    const referral = hasReferral();
    if (barEl || safeGet(ACTIVE_KEY) === "1" || safeGet(referral ? DISMISS_KEY + ":ref" : DISMISS_KEY)) return;

    const bar = document.createElement("div");
    bar.className = "promo-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Promo");

    const lineEl = document.createElement("span");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "promo-close";
    closeBtn.textContent = "×";

    bar.appendChild(lineEl);
    bar.appendChild(closeBtn);
    document.body.insertBefore(bar, document.body.firstChild);
    barEl = bar;

    function render() {
      const t = TEXT[getLang()];
      const line = referral ? REF_TEXT[getLang()].replace("{ref}", REF_PCT) : t.line;
      lineEl.innerHTML = line.replace("{code}", PROMO.code).replace("{pct}", PROMO.percent);
      closeBtn.setAttribute("aria-label", t.close);
      updateHeight(bar);
    }

    render();
    window.addEventListener("resize", () => updateHeight(bar));
    document.addEventListener("fundly:lang-changed", render);

    closeBtn.addEventListener("click", () => {
      safeSet(referral ? DISMISS_KEY + ":ref" : DISMISS_KEY, "1");
      hide();
    });
  }

  function hide() {
    if (barEl) barEl.remove();
    barEl = null;
    updateHeight(null);
  }

  window.FundlyPromo = {
    // true = hráč má aktivní účet → lištu schovat (a nezobrazovat ani na dalších stránkách)
    setActivePlayer(active) {
      safeSet(ACTIVE_KEY, active ? "1" : null);
      if (active) hide(); else if (document.body) init();
    },
  };

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
