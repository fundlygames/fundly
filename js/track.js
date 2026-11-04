/* Fundly — bezcookiová návštěvnost (viz supabase/functions/track-visit).
   Posílá jen cestu stránky, zdroj (utm_source / odkazující web), šířku okna a jazyk — žádná cookie, žádné IP,
   žádný osobní údaj. Nesleduje se admin ani stránka investorů; "Do Not Track" se respektuje (na serveru). */
(function () {
  "use strict";
  // Orientační země bez jakékoli služby třetí strany: z časového pásma prohlížeče, jinak z regionu jazyka (cs-CZ → CZ).
  var TZ = { "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Warsaw": "PL", "Europe/Budapest": "HU", "Europe/Berlin": "DE", "Europe/Vienna": "AT", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Lisbon": "PT", "Europe/Amsterdam": "NL", "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Athens": "GR", "Europe/Bucharest": "RO", "Europe/Sofia": "BG", "Europe/Belgrade": "RS", "Europe/Zagreb": "HR", "Europe/Ljubljana": "SI", "Europe/Vilnius": "LT", "Europe/Riga": "LV", "Europe/Tallinn": "EE", "Europe/Kiev": "UA", "Europe/Kyiv": "UA", "Europe/Istanbul": "TR", "Europe/Luxembourg": "LU", "Europe/Malta": "MT", "Atlantic/Reykjavik": "IS", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US", "America/Toronto": "CA", "America/Vancouver": "CA", "America/Mexico_City": "MX", "America/Sao_Paulo": "BR", "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Santiago": "CL", "America/Lima": "PE", "America/Caracas": "VE", "Asia/Dubai": "AE", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Singapore": "SG", "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK", "Asia/Bangkok": "TH", "Asia/Jakarta": "ID", "Asia/Manila": "PH", "Asia/Karachi": "PK", "Asia/Riyadh": "SA", "Asia/Jerusalem": "IL", "Asia/Tbilisi": "GE", "Asia/Almaty": "KZ", "Africa/Lagos": "NG", "Africa/Johannesburg": "ZA", "Africa/Cairo": "EG", "Africa/Casablanca": "MA", "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Perth": "AU", "Pacific/Auckland": "NZ" };
  function guessCountry() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TZ[tz]) return TZ[tz];
      var m = /[-_]([A-Za-z]{2})$/.exec(navigator.language || "");
      return m ? m[1].toUpperCase() : "";
    } catch (e) { return ""; }
  }

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
        body: JSON.stringify({ path: path, src: src, w: window.innerWidth, lang: lang, cc: guessCountry() }),
        keepalive: true,
      }).catch(function () { /* analytics nesmí nikdy nic rozbít */ });
    } catch (e) { /* ignore */ }
  }
  // config.js je "defer" — počkáme na DOM i na i18n (jazyk stránky)
  if (document.readyState === "complete") setTimeout(run, 300);
  else window.addEventListener("load", function () { setTimeout(run, 300); });
})();
