/* Fundly — VSL video loader.
 * - CZ/SK visitors get the Czech VSL, everyone else the English one.
 * - Phones / Save-Data get the 720p file (~5.6 MB), larger screens 1080p (~12.8 MB).
 * - Nothing is downloaded until the video is near the viewport (lazy), so the page
 *   itself loads exactly as fast as before. Files are "faststart" encoded, so playback
 *   begins after the first few hundred KB.
 * Markup: <video data-vsl [data-vsl-eager] controls playsinline preload="none" width="1920" height="1080"></video>
 */
(() => {
  const VARIANTS = {
    cz: { poster: "assets/vsl-cz-poster.jpg", hd: "assets/vsl-cz-1080.mp4", sd: "assets/vsl-cz-720.mp4" },
    en: { poster: "assets/vsl-poster.jpg", hd: "assets/fundly-vsl.mp4", sd: "assets/fundly-vsl.mp4" },
  };

  const pickVariant = () => {
    const lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return lang === "cs" || lang === "sk" ? "cz" : "en";
  };

  const preferSmall = () => {
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return true;
    return window.matchMedia("(max-width: 820px)").matches;
  };

  function load(video) {
    const key = pickVariant();
    if (video.dataset.vslCur === key) return;
    // Never swap a video the visitor has already started.
    if (video.dataset.vslCur && (!video.paused || video.currentTime > 0)) return;
    const v = VARIANTS[key];
    video.dataset.vslCur = key;
    video.poster = v.poster;
    video.preload = "metadata";
    video.src = preferSmall() ? v.sd : v.hd;
  }

  function init() {
    const videos = [...document.querySelectorAll("video[data-vsl]")];
    if (!videos.length) return;

    const lazy = [];
    videos.forEach((video) => {
      if (video.hasAttribute("data-vsl-eager") || !("IntersectionObserver" in window)) load(video);
      else lazy.push(video);

      video.addEventListener("play", () => {
        if (video.dataset.vslTracked) return;
        video.dataset.vslTracked = "1";
        try { window.gtag && window.gtag("event", "vsl_play", { vsl_lang: video.dataset.vslCur, page: location.pathname }); } catch (_) {}
      });
    });

    if (lazy.length) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          e.target.dataset.vslReady = "1";
          load(e.target);
        });
      }, { rootMargin: "600px 0px" });
      lazy.forEach((v) => io.observe(v));
    }

    // Language switch → swap to the matching VSL (only if not yet started).
    document.addEventListener("fundly:lang-changed", () => {
      videos.forEach((v) => {
        if (v.hasAttribute("data-vsl-eager") || v.dataset.vslReady) load(v);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
