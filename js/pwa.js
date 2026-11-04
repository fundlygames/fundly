/* Fundly — "Add to Home Screen" (PWA).
   - registers the service worker (sw.js) so Chrome/Android treats the site as installable,
   - Android/Chrome: shows our own "Install app" banner using the browser's install prompt,
   - iOS (Safari has no install prompt): shows a short "Share → Add to Home Screen" hint,
   - never shown inside the installed app, in Facebook/Instagram in-app browsers (they cannot
     install) or on desktop, and a dismissed banner stays away for 14 days. */
(function () {
  "use strict";
  var DISMISS_KEY = "fundly:pwaDismissedAt";
  var DISMISS_MS = 14 * 86400000;

  var secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (secure && "serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("sw:", e && e.message); });
    });
  }

  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var inApp = /FBAN|FBAV|Instagram|Line\/|TikTok|Snapchat|MicroMessenger/i.test(ua);
  function standalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
  }
  function dismissedRecently() {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_MS; } catch (e) { return false; }
  }
  function isPhone() { return window.matchMedia && window.matchMedia("(max-width: 900px)").matches; }

  var T = {
    en: { title: "Install the Fundly app", text: "Add Fundly to your home screen for one-tap access.", btn: "Install", ios: "Tap <b>Share</b> <span class=\"fpwa-ico\">⬆️</span> then <b>Add to Home Screen</b>.", close: "Close" },
    cs: { title: "Nainstalujte aplikaci Fundly", text: "Přidejte Fundly na plochu pro přístup jedním klepnutím.", btn: "Nainstalovat", ios: "Klepněte na <b>Sdílet</b> <span class=\"fpwa-ico\">⬆️</span> a pak <b>Přidat na plochu</b>.", close: "Zavřít" },
    sk: { title: "Nainštalujte aplikáciu Fundly", text: "Pridajte Fundly na plochu pre prístup jedným ťuknutím.", btn: "Nainštalovať", ios: "Kliknite na <b>Zdieľať</b> <span class=\"fpwa-ico\">⬆️</span> a potom <b>Pridať na plochu</b>.", close: "Zavrieť" },
    pl: { title: "Zainstaluj aplikację Fundly", text: "Dodaj Fundly do ekranu głównego, by wchodzić jednym dotknięciem.", btn: "Zainstaluj", ios: "Dotknij <b>Udostępnij</b> <span class=\"fpwa-ico\">⬆️</span>, potem <b>Do ekranu głównego</b>.", close: "Zamknij" },
    hu: { title: "Telepítsd a Fundly appot", text: "Add a Fundly-t a kezdőképernyőhöz, hogy egy érintéssel elérd.", btn: "Telepítés", ios: "Koppints a <b>Megosztás</b> <span class=\"fpwa-ico\">⬆️</span> gombra, majd <b>Kezdőképernyőhöz adás</b>.", close: "Bezárás" },
    es: { title: "Instala la app de Fundly", text: "Añade Fundly a tu pantalla de inicio para entrar con un toque.", btn: "Instalar", ios: "Toca <b>Compartir</b> <span class=\"fpwa-ico\">⬆️</span> y luego <b>Añadir a pantalla de inicio</b>.", close: "Cerrar" }
  };
  function tr() {
    var l = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return T[l] || T.en;
  }

  var deferred = null, banner = null;

  function css() {
    if (document.getElementById("fpwa-css")) return;
    var s = document.createElement("style"); s.id = "fpwa-css";
    s.textContent =
      ".fpwa{position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:8500;display:flex;gap:12px;align-items:center;" +
      "padding:12px 14px;border-radius:16px;background:#0b0b10;border:1px solid rgba(20,241,149,.35);box-shadow:0 10px 30px rgba(0,0,0,.55);" +
      "font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#e8e8ee;max-width:520px;margin:0 auto}" +
      ".fpwa.fpwa-lift{bottom:calc(env(safe-area-inset-bottom,0px) + 84px)}" +
      ".fpwa img{width:44px;height:44px;border-radius:11px;flex:none}" +
      ".fpwa .fpwa-t{flex:1;min-width:0;font-size:13px;line-height:1.4;color:#a9a9b8}" +
      ".fpwa .fpwa-t b{color:#fff}" +
      ".fpwa .fpwa-t strong{display:block;color:#fff;font-size:14px;margin-bottom:2px}" +
      ".fpwa .fpwa-ico{font-size:14px}" +
      ".fpwa button.fpwa-go{flex:none;background:#14f195;color:#020204;border:0;border-radius:10px;padding:10px 14px;font-weight:700;font-size:13px;cursor:pointer}" +
      ".fpwa button.fpwa-x{flex:none;background:transparent;border:0;color:#8a8a98;font-size:22px;line-height:1;padding:4px 6px;cursor:pointer}";
    document.head.appendChild(s);
  }

  function hide(remember) {
    if (banner) { banner.remove(); banner = null; }
    if (remember) { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* ignore */ } }
  }

  function show(mode) {
    if (banner || standalone() || inApp || dismissedRecently() || !isPhone()) return;
    css();
    var t = tr();
    banner = document.createElement("div");
    banner.className = "fpwa" + (document.querySelector(".dnav-mobile") ? " fpwa-lift" : "");
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", t.title);
    banner.innerHTML =
      '<img src="assets/icons/icon-192.png" alt="" />' +
      '<div class="fpwa-t"><strong>' + t.title + "</strong>" + (mode === "ios" ? t.ios : t.text) + "</div>" +
      (mode === "prompt" ? '<button type="button" class="fpwa-go">' + t.btn + "</button>" : "") +
      '<button type="button" class="fpwa-x" aria-label="' + t.close + '">×</button>';
    document.body.appendChild(banner);
    banner.querySelector(".fpwa-x").addEventListener("click", function () { hide(true); });
    var go = banner.querySelector(".fpwa-go");
    if (go) go.addEventListener("click", function () { window.FundlyPWA.install(); });
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    setTimeout(function () { show("prompt"); }, 4000);
  });
  window.addEventListener("appinstalled", function () { deferred = null; hide(false); });

  // iOS never fires beforeinstallprompt — show the manual hint instead (Safari and iOS Chrome both support it)
  if (isIOS && !standalone()) window.addEventListener("load", function () { setTimeout(function () { show("ios"); }, 4000); });

  window.FundlyPWA = {
    // callable from any button (e.g. a future "Install app" entry in Settings)
    install: function () {
      if (!deferred) return Promise.resolve(false);
      var p = deferred; deferred = null;
      p.prompt();
      return p.userChoice.then(function (c) { hide(c && c.outcome !== "accepted"); return c && c.outcome === "accepted"; });
    },
    canInstall: function () { return !!deferred; }
  };
})();
