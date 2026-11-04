/* Fundly — bezcookiová návštěvnost (viz supabase/functions/track-visit).
   Posílá jen cestu stránky, zdroj (utm_source / odkazující web), šířku okna a jazyk — žádná cookie, žádné IP,
   žádný osobní údaj. Nesleduje se admin ani stránka investorů; "Do Not Track" se respektuje (na serveru). */
(function () {
  "use strict";
  function run() {
    try {
      var path = location.pathname;
      if (/^\/(admin|investors)/i.test(path)) return;
      if (typeof FUNDLY_SUPABASE_URL === "undefined" || (typeof fundlyBackendEnabled === "function" && !fundlyBackendEnabled())) return;
      if (localStorage.getItem("fundly:noTrack")) return; // vlastní provoz lze vypnout: localStorage.setItem("fundly:noTrack","1")

      var q = new URLSearchParams(location.search);
      var src = q.get("utm_source") || q.get("ref") || "";
      if (!src) { try { src = sessionStorage.getItem("fundly:src") || ""; } catch (e) { /* ignore */ } }
      if (!src) {
        try { var a = JSON.parse(localStorage.getItem("fundly:attribution") || "null"); if (a && a.utm_source) src = a.utm_source; } catch (e) { /* ignore */ }
      }
      if (!src && document.referrer) {
        try { var h = new URL(document.referrer).hostname.replace(/^www\./, ""); if (h && h !== location.hostname.replace(/^www\./, "")) src = h; } catch (e) { /* ignore */ }
      }
      if (!src) src = "direct";
      try { sessionStorage.setItem("fundly:src", src); } catch (e) { /* ignore */ }

      var lang = (document.documentElement.lang || "").slice(0, 2);
      fetch(FUNDLY_SUPABASE_URL + "/functions/v1/track-visit", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" }, // jednoduchý požadavek — bez CORS preflightu
        body: JSON.stringify({ path: path, src: src, w: window.innerWidth, lang: lang }),
        keepalive: true,
      }).catch(function () { /* analytics nesmí nikdy nic rozbít */ });
    } catch (e) { /* ignore */ }
  }
  // config.js je "defer" — počkáme na DOM i na i18n (jazyk stránky)
  if (document.readyState === "complete") setTimeout(run, 300);
  else window.addEventListener("load", function () { setTimeout(run, 300); });
})();
