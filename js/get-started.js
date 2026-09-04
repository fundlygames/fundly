/* Fundly — /get-started (ad landing: capital picker + checkout handoff).
   Loaded after config.js, packages.js and whop.js. Every "buy" action hands
   off to the real checkout wizard (checkout?package=<key>) — this page never
   talks to the backend directly. */

(function () {
  "use strict";

  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const usdSigned = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  const $ = (id) => document.getElementById(id);

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
        ${p.top ? '<span class="badge">Most popular</span>' : ""}
        <span class="nm">${p.name}</span>
        <span class="cap">${usd(p.cap)}</span>
        <span class="price">${usd(p.price)} <span class="lbl">one-time</span></span>
      </button>`).join("");
  }

  function renderDetails() {
    const m = packageMeta(packageByKey(active));
    $("gsDetails").innerHTML = `
      <div class="gs-info-grid">
        <div class="gs-info-box">
          <h4>Phase targets</h4>
          <div class="r"><span>Phase 1</span><span class="v green">${usdSigned(m.target1)}</span></div>
          <div class="r"><span>Phase 2</span><span class="v green">${usdSigned(m.target2)}</span></div>
        </div>
        <div class="gs-info-box">
          <h4>Limits</h4>
          <div class="r"><span>Max. loss (static)</span><span class="v red">${usdSigned(-m.drawdown)}</span></div>
          <div class="r"><span>Max. daily loss</span><span class="v red">${usdSigned(-m.dailyLoss)}</span></div>
        </div>
      </div>
      <div class="gs-faq-strip">
        <span class="gs-faq-chip">✓ Odds 1.00–8.00, all sports</span>
        <span class="gs-faq-chip">✓ 30 days per phase</span>
        <span class="gs-faq-chip">✓ ${m.profitSplit}% performance split</span>
        <span class="gs-faq-chip">✓ Rewards in 48h</span>
      </div>`;
  }

  function render() {
    const pkg = packageByKey(active);

    renderPkgGrid();
    renderDetails();

    $("gsSbSize").textContent = usd(pkg.cap);
    $("gsSbPrice").textContent = usd(pkg.price);
    $("gsMbSize").textContent = usd(pkg.cap);
    $("gsMbPrice").textContent = usd(pkg.price);
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

  render();
})();
