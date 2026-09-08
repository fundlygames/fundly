/* Fundly — /get-started (ad landing: capital picker + checkout handoff).
   Loaded after config.js, packages.js and whop.js. Every "buy" action hands
   off to the real checkout wizard (checkout?package=<key>) — this page never
   talks to the backend directly. */

(function () {
  "use strict";

  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const usdSigned = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  const $ = (id) => document.getElementById(id);
  const t = window.t || ((k) => k);

  const urlPkg = new URLSearchParams(window.location.search).get("package");
  let active = urlPkg && PACKAGES.some((p) => p.key === urlPkg) ? urlPkg : "advanced";

  function goToCheckout() {
    if (typeof fbq === "function") {
      const p = packageByKey(active);
      fbq("track", "InitiateCheckout", {
        content_ids: [active],
        content_name: p.name,
        currency: "USD",
        value: p.price,
      });
    }
    window.location.href = "checkout?package=" + encodeURIComponent(active);
  }

  // Compact cards: name + capital + price only — full detail (targets,
  // limits, odds/days/split) lives in #gsDetails for the SELECTED package
  // only, so comparing all 5 packages doesn't mean scanning 5x that data.
  function renderPkgGrid() {
    $("gsPkgGrid").innerHTML = PACKAGES.map((p) => `
      <button type="button" role="radio" aria-checked="${p.key === active}"
        class="gs-pkg-card ${p.key === active ? "active" : ""}" data-key="${p.key}">
        ${p.top ? `<span class="badge">TOP</span>` : ""}
        <span class="nm">${p.name}</span>
        <span class="cap">${usd(p.cap)}</span>
        <span class="price">${promoActive() ? `<span class="was">${usd(p.price)}</span> ` : ""}${usd(promoActive() ? promoPrice(p.price) : p.price)} <span class="lbl">${t("packages.oneTime")}</span></span>
      </button>`).join("");
  }

  function renderDetails() {
    const m = packageMeta(packageByKey(active));
    $("gsDetails").innerHTML = `
      <div class="gs-info-grid">
        <div class="gs-info-box">
          <h4>${t("gs.phaseTargets")}</h4>
          <div class="r"><span>${t("packages.phase1Tag")}</span><span class="v green">${usdSigned(m.target1)}</span></div>
          <div class="r"><span>${t("packages.phase2Tag")}</span><span class="v green">${usdSigned(m.target2)}</span></div>
        </div>
        <div class="gs-info-box">
          <h4>${t("gs.limits")}</h4>
          <div class="r"><span>${t("packages.maxLossStatic")}</span><span class="v red">${usdSigned(-m.drawdown)}</span></div>
          <div class="r"><span>${t("packages.maxDailyLoss")}</span><span class="v red">${usdSigned(-m.dailyLoss)}</span></div>
        </div>
      </div>
      <div class="gs-faq-strip">
        <span class="gs-faq-chip">✓ ${t("gs.chipOdds")}</span>
        <span class="gs-faq-chip">✓ ${t("gs.chipDays")}</span>
        <span class="gs-faq-chip">✓ ${m.profitSplit}% ${t("gs.chipSplitSuffix")}</span>
        <span class="gs-faq-chip">✓ ${t("gs.chipRewards")}</span>
      </div>`;
  }

  function render() {
    const pkg = packageByKey(active);

    renderPkgGrid();
    renderDetails();

    const shownPrice = promoActive() ? promoPrice(pkg.price) : pkg.price;
    const wasHtml = promoActive() ? `<span class="was">${usd(pkg.price)}</span> ` : "";

    $("gsSbSize").textContent = usd(pkg.cap);
    $("gsSbPrice").innerHTML = wasHtml + usd(shownPrice);
    $("gsMbSize").textContent = usd(pkg.cap);
    $("gsMbPrice").innerHTML = wasHtml + usd(shownPrice);
    const promoNote = $("gsPromoNote");
    if (promoNote) promoNote.textContent = promoActive() ? t("packages.promoTag").replace("{pct}", PROMO.percent).replace("{code}", PROMO.code) : "";
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-key]");
    if (el) {
      active = el.dataset.key;
      render();
      return;
    }
    if (e.target.closest("#gsCta") || e.target.closest("#gsMbCta")) {
      goToCheckout();
    }
  });

  const mobileBar = $("gsMobileBar");
  window.addEventListener("scroll", () => {
    mobileBar.classList.toggle("show", window.scrollY > 260);
  });

  document.addEventListener("fundly:lang-changed", render);

  render();

  // ---------- scroll reveal (same pattern as js/main.js) ----------
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  // ---------- count-up on the real numbers already on the page (trust strip, math split) ----------
  function formatCount(n, el) {
    const prefix = el.dataset.countPrefix || "";
    const suffix = el.dataset.countSuffix || "";
    return prefix + Math.round(n).toLocaleString("en-US") + suffix;
  }
  function countUp(el) {
    const target = Number(el.dataset.count);
    if (!Number.isFinite(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = formatCount(target, el);
      return;
    }
    const duration = 900;
    const start = Date.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatCount(target * eased, el);
      if (p >= 1) clearInterval(timer);
    }, 40);
  }
  const countIo = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          countUp(entry.target);
          countIo.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );
  document.querySelectorAll("[data-count]").forEach((el) => countIo.observe(el));
})();
