/* Fundly — /get-started (ad landing: capital picker + checkout handoff).
   Loaded after config.js, packages.js and whop.js. Every "buy" action hands
   off to the real checkout wizard (checkout?package=<key>) — this page never
   talks to the backend directly. */

(function () {
  "use strict";

  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const usdSigned = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  const $ = (id) => document.getElementById(id);

  const ART = {
    starter: "assets/card2-vyzva.jpg",
    standard: "assets/card2-verifikace.jpg",
    advanced: "assets/card2-tiper.jpg",
    pro: "assets/card2-vyzva.jpg",
    elite: "assets/card2-verifikace.jpg",
  };
  const FEATURED = ["starter", "advanced", "elite"];

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

  function render() {
    const pkg = packageByKey(active);
    const m = packageMeta(pkg);

    $("gsSizeRow").innerHTML = PACKAGES.map((p) => `
      <div class="gs-size-pill ${p.key === active ? "active" : ""}" data-key="${p.key}">
        <span class="n">${usd(p.cap)}</span><span class="p">${usd(p.price)}</span>
      </div>`).join("");

    $("gsPkgGrid").innerHTML = FEATURED.map((key) => {
      const p = packageByKey(key);
      const pm = packageMeta(p);
      return `
      <div class="gs-pkg-card ${p.key === active ? "active" : ""}" data-key="${p.key}">
        <div class="art" style="background-image:url('${ART[p.key]}')">
          ${p.top ? '<span class="badge">Most popular</span>' : ""}
        </div>
        <div class="body">
          <div class="nm">${p.name} · ${usd(p.cap)}</div>
          <div class="row"><span>Phase 1 target</span><span class="v green">${usdSigned(pm.target1)}</span></div>
          <div class="row"><span>Max. entry size</span><span class="v">${usd(pm.maxStake)}</span></div>
          <div class="row"><span>One-time fee</span><span class="v">${usd(p.price)}</span></div>
        </div>
      </div>`;
    }).join("");

    $("gsT1").textContent = usdSigned(m.target1);
    $("gsT2").textContent = usdSigned(m.target2);
    $("gsDd").textContent = usdSigned(-m.drawdown);
    $("gsDl").textContent = usdSigned(-m.dailyLoss);

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
