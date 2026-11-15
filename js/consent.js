/* Fundly — souhlas s cookies (zákon č. 127/2005 Sb. § 89 odst. 3, GDPR, ePrivacy).
   Měřicí a reklamní skripty (Meta Pixel, Microsoft Clarity, Google Analytics) se načtou AŽ
   po souhlasu. Stránky si do té doby jen frontují volání (fbq / gtag / clarity stuby
   v <head>) — po souhlasu se odešlou, bez souhlasu nikdy (skripty se vůbec nestáhnou).
   Volba se pamatuje v localStorage "fundly:consent" = "all" | "necessary" (+ datum).
   Změnit ji jde kdykoli: prvek s atributem data-cookie-settings nebo adresa s ?cookies. */
(function () {
  const KEY = "fundly:consent";
  const IDS = { pixel: "1872298250403527", clarity: "ycxug4lnng", ga: "G-C01K5JXEGQ" };

  const T = {
    en: {
      text: "We use necessary storage to keep you signed in and remember your language. With your consent we also use analytics and marketing cookies (Google Analytics, Microsoft Clarity, Meta Pixel) to improve the site and measure our ads.",
      accept: "Accept all", reject: "Necessary only", more: "More info", aria: "Cookie consent",
    },
    cs: {
      text: "Nezbytné úložiště používáme k přihlášení a zapamatování jazyka. S tvým souhlasem používáme i analytické a marketingové cookies (Google Analytics, Microsoft Clarity, Meta Pixel), abychom zlepšovali web a měřili reklamy.",
      accept: "Přijmout vše", reject: "Jen nezbytné", more: "Více informací", aria: "Souhlas s cookies",
    },
    sk: {
      text: "Nevyhnutné úložisko používame na prihlásenie a zapamätanie jazyka. S tvojím súhlasom používame aj analytické a marketingové cookies (Google Analytics, Microsoft Clarity, Meta Pixel), aby sme zlepšovali web a merali reklamy.",
      accept: "Prijať všetko", reject: "Len nevyhnutné", more: "Viac informácií", aria: "Súhlas s cookies",
    },
    pl: {
      text: "Niezbędnej pamięci używamy do logowania i zapamiętania języka. Za Twoją zgodą używamy też analitycznych i marketingowych plików cookie (Google Analytics, Microsoft Clarity, Meta Pixel), aby ulepszać stronę i mierzyć reklamy.",
      accept: "Akceptuj wszystkie", reject: "Tylko niezbędne", more: "Więcej informacji", aria: "Zgoda na cookies",
    },
    hu: {
      text: "A szükséges tárolót a bejelentkezéshez és a nyelv megjegyzéséhez használjuk. Hozzájárulásoddal analitikai és marketing sütiket is használunk (Google Analytics, Microsoft Clarity, Meta Pixel) a webhely fejlesztéséhez és a hirdetések méréséhez.",
      accept: "Összes elfogadása", reject: "Csak a szükségesek", more: "További információ", aria: "Süti-hozzájárulás",
    },
    es: {
      text: "Usamos almacenamiento necesario para mantener tu sesión y recordar tu idioma. Con tu consentimiento también usamos cookies de análisis y marketing (Google Analytics, Microsoft Clarity, Meta Pixel) para mejorar el sitio y medir nuestros anuncios.",
      accept: "Aceptar todo", reject: "Solo necesarias", more: "Más información", aria: "Consentimiento de cookies",
    },
  };

  const get = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const set = (v) => { try { localStorage.setItem(KEY, JSON.stringify({ v, at: new Date().toISOString() })); } catch (e) { /* */ } };
  const lang = () => {
    let l = "en";
    try { l = localStorage.getItem("fundly:lang") || document.documentElement.lang || (navigator.language || "en"); } catch (e) { /* */ }
    l = String(l).slice(0, 2).toLowerCase();
    return T[l] ? l : "en";
  };

  let loaded = false;
  function addScript(src) {
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }
  // načte skutečné knihovny — fronty ze stubů v <head> se tím odešlou
  function loadTrackers() {
    if (loaded) return;
    loaded = true;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
    addScript("https://www.clarity.ms/tag/" + IDS.clarity);
    addScript("https://www.googletagmanager.com/gtag/js?id=" + IDS.ga);
  }

  let bar = null;
  function hideBar() { if (bar) { bar.remove(); bar = null; } }
  function showBar() {
    if (bar || !document.body) return;
    const t = T[lang()];
    bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-live", "polite");
    bar.setAttribute("aria-label", t.aria);
    bar.innerHTML =
      '<p class="cookie-text"></p>' +
      '<div class="cookie-actions">' +
      '<a class="cookie-more" href="privacy#cookies"></a>' +
      '<button type="button" class="cookie-btn cookie-reject"></button>' +
      '<button type="button" class="cookie-btn cookie-accept"></button>' +
      "</div>";
    bar.querySelector(".cookie-text").textContent = t.text;
    bar.querySelector(".cookie-more").textContent = t.more;
    // privacy.html má anglický a český blok — kotva podle jazyka, který stránka zobrazí
    bar.querySelector(".cookie-more").href = "privacy#" + (lang() === "cs" || lang() === "sk" ? "cookies-cs" : "cookies");
    bar.querySelector(".cookie-reject").textContent = t.reject;
    bar.querySelector(".cookie-accept").textContent = t.accept;
    bar.querySelector(".cookie-accept").addEventListener("click", () => { set("all"); hideBar(); loadTrackers(); });
    bar.querySelector(".cookie-reject").addEventListener("click", () => {
      const wasAll = (get() || {}).v === "all";
      set("necessary");
      hideBar();
      if (wasAll && loaded) location.reload(); // odvolání souhlasu: zastavit už načtené skripty
    });
    document.body.appendChild(bar);
  }

  // Styly přímo tady — lišta je na všech stránkách a nesmí záviset na jejich CSS.
  function injectCss() {
    if (document.getElementById("cookie-css")) return;
    const st = document.createElement("style");
    st.id = "cookie-css";
    st.textContent =
      ".cookie-bar{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:760px;margin:0 auto;background:#0d0d12;color:#e8e8ec;border:1px solid #ffffff22;border-radius:16px;padding:16px 18px;box-shadow:0 12px 40px -8px rgb(0 0 0/.7);display:flex;gap:14px;align-items:center;flex-wrap:wrap;font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}" +
      ".cookie-text{margin:0;flex:1 1 320px;color:#c9c9d2;font-size:13px}" +
      ".cookie-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}" +
      ".cookie-more{color:#9a9aa8;font-size:12px;margin-right:4px}" +
      ".cookie-btn{border-radius:10px;padding:9px 14px;font:inherit;font-weight:700;font-size:13px;cursor:pointer;border:1px solid #ffffff2a;background:transparent;color:#e8e8ec}" +
      ".cookie-accept{background:#14f195;color:#04140c;border-color:#14f195}" +
      "@media (max-width:560px){.cookie-bar{left:10px;right:10px;bottom:10px}.cookie-actions{width:100%}.cookie-btn{flex:1}}";
    document.head.appendChild(st);
  }

  function init() {
    injectCss();
    const c = get();
    if (c && c.v === "all") loadTrackers();
    let force = false;
    try { force = new URLSearchParams(location.search).has("cookies"); } catch (e) { /* */ }
    if (!c || force) showBar();
    document.addEventListener("click", (e) => {
      const el = e.target.closest && e.target.closest("[data-cookie-settings]");
      if (!el) return;
      e.preventDefault();
      showBar();
    });
  }

  window.FundlyConsent = { open: showBar, granted: () => (get() || {}).v === "all" };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
