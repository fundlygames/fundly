/* Fundly — checkout wizard (1 package selection → 2 sign up → 3 payment).
   Loaded after config.js, packages.js, portfolio.js and whop.js. */

(function () {
  "use strict";

  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const usdSigned = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
  const usdShort = (n) => "$" + (n >= 1000 ? Math.round(n / 1000) + "K" : n);

  const $ = (id) => document.getElementById(id);
  const t = window.t || ((k) => k);

  // ---------- state ----------
  const state = {
    step: 1,
    pkg: "advanced",
    email: "",
    checkoutUrl: null,
    paymentRunning: false,
  };

  // Package preset from URL (?package=elite), fallback to Advanced.
  const urlPkg = new URLSearchParams(window.location.search).get("package");
  if (urlPkg && PACKAGES.some((p) => p.key === urlPkg)) state.pkg = urlPkg;

  const pkg = () => packageByKey(state.pkg);
  const meta = () => packageMeta(pkg());

  // ---------- launch capacity (limit "first N buyers", then waitlist) ----------
  const EMAIL_RE_WL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const capBanner = $("capBanner");
  const waitlistPanel = $("waitlistPanel");
  const waitlistForm = $("waitlistForm");
  const waitlistEmail = $("waitlistEmail");
  const waitlistErr = $("waitlistErr");
  const waitlistDone = $("waitlistDone");

  async function joinWaitlist(email) {
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/waitlist-join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, packageKey: state.pkg }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("co.errJoinWaitlist"));
  }

  waitlistForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = waitlistEmail.value.trim();
    waitlistErr.hidden = true;
    if (!EMAIL_RE_WL.test(email)) {
      waitlistErr.textContent = t("co.errInvalidEmail");
      waitlistErr.hidden = false;
      return;
    }
    const btn = waitlistForm.querySelector("button");
    btn.disabled = true;
    try {
      await joinWaitlist(email);
      waitlistForm.hidden = true;
      waitlistDone.hidden = false;
    } catch (err) {
      waitlistErr.textContent = err.message;
      waitlistErr.hidden = false;
      btn.disabled = false;
    }
  });

  // Sold-out fallback shown inside step 3 when the payment session gets
  // rejected with SOLD_OUT (someone else claimed the last spot in a race).
  function showSoldOut() {
    waitlistPanel.hidden = false;
    if (state.email) waitlistEmail.value = state.email;
    waitlistPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function checkAvailability() {
    if (!(typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled())) return;
    try {
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/checkout-availability`);
      const data = await res.json().catch(() => ({}));
      if (!data.capped) return;
      if (data.soldOut) {
        capBanner.textContent = t("co.capSoldOut");
        capBanner.hidden = false;
        waitlistPanel.hidden = false;
      } else if (typeof data.spotsLeft === "number" && data.spotsLeft <= 5) {
        capBanner.textContent = data.spotsLeft === 1
          ? t("co.capSpotsLeftOne")
          : t("co.capSpotsLeftMany").replace("{n}", data.spotsLeft);
        capBanner.hidden = false;
      }
    } catch (e) {
      // Availability check is cosmetic UX only — a failure here must not block checkout.
    }
  }
  checkAvailability();

  // ---------- step 1: package cards ----------
  const pkgGrid = $("pkgGrid");

  // Compact cards: name + capital + price only — everything else (targets,
  // limits, odds/days/split) lives in the details panel for the SELECTED
  // package only, so comparing 5 packages doesn't mean scanning 5x that data.
  function renderPkgGrid() {
    pkgGrid.innerHTML = PACKAGES.map((p, i) => {
      const pct = Math.round(((i + 1) / PACKAGES.length) * 100);
      return `
      <button type="button" role="radio" aria-checked="${p.key === state.pkg}"
        class="pkg-card ${p.key === state.pkg ? "active" : ""}" data-key="${p.key}">
        ${p.top ? '<span class="top-badge">TOP</span>' : ""}
        <span class="pkg-ring" style="--pct:${pct}%"><span class="pkg-ring-inner">${usdShort(p.cap)}</span></span>
        <span class="nm">${p.name}</span>
        <span class="price">${promoActive() ? `<span class="was">${usd(p.price)}</span> ` : ""}${usd(promoActive() ? promoPrice(p.price) : p.price)} <span class="lbl">${t("packages.oneTime")}</span></span>
      </button>`;
    }).join("");
  }

  pkgGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".pkg-card");
    if (!card || card.dataset.key === state.pkg) return;
    state.pkg = card.dataset.key;
    clearPay();
    renderPkgGrid();
    renderDetails();
    renderCheckoutRow();
    renderSummary();
  });

  // ---------- details panel: phase targets, limits, odds/days/split (selected package) ----------
  function renderDetails() {
    const m = meta();
    $("coDetails").innerHTML = `
      <div class="co-cols">
        <div class="co-box">
          <h3 class="co-box-h">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><circle cx="7" cy="7" r="1.8" fill="currentColor"/></svg>
            ${t("gs.phaseTargets")}
          </h3>
          <div class="co-row"><span class="k">${t("packages.phase1Tag")}</span><span class="v green">${usdSigned(m.target1)}</span></div>
          <div class="co-row"><span class="k">${t("packages.phase2Tag")}</span><span class="v green">${usdSigned(m.target2)}</span></div>
        </div>
        <div class="co-box">
          <h3 class="co-box-h">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.5l5.5 10h-11L7 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 5.5v2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="9.8" r=".8" fill="currentColor"/></svg>
            ${t("gs.limits")}
          </h3>
          <div class="co-row"><span class="k">${t("packages.maxLossStatic")}</span><span class="v red">${usdSigned(-m.drawdown)}</span></div>
          <div class="co-row"><span class="k">${t("packages.maxDailyLoss")}</span><span class="v red">${usdSigned(-m.dailyLoss)}</span></div>
          <p class="co-note">${t("co.limitsNote")}</p>
        </div>
      </div>
      <div class="co-chips">
        <span class="co-chip">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1.5 10.5l3.5-3.5 2.5 2.5 5-5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          ${t("co.chipOddsShort")}
        </span>
        <span class="co-chip">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4v3l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          ${t("co.chipDaysShort")}
        </span>
        <span class="co-chip">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.5v11M10 4c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 2 3 2 3 .9 3 2-1.3 2-3 2-3-.9-3-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          ${m.profitSplit} % ${t("co.chipProfitSuffix")}
        </span>
      </div>`;
  }

  // ---------- condensed checkout action row (selected package, right above Continue) ----------
  function renderCheckoutRow() {
    const p = pkg();
    const shownPrice = promoActive() ? promoPrice(p.price) : p.price;
    const wasHtml = promoActive() ? `<span class="was">${usd(p.price)}</span> ` : "";
    $("coCheckoutRow").innerHTML = `
      <div class="co-checkout-pkg">
        <span class="nm">${p.name}</span>
        <span class="cap">${usd(p.cap)} ${t("packages.simCapital")}</span>
        ${promoActive() ? `<span class="price-promo-tag">${t("packages.promoTag").replace("{pct}", PROMO.percent).replace("{code}", PROMO.code)}</span>` : ""}
      </div>
      <div class="co-checkout-price">
        <span class="v">${wasHtml}${usd(shownPrice)}</span>
        <span class="lbl">${t("co.oneTimeFee")}</span>
      </div>`;
    $("coMbPkg").textContent = p.name;
    $("coMbPrice").innerHTML = wasHtml + usd(shownPrice);
  }

  // ---------- summary (right column) ----------
  function renderSummary() {
    const p = pkg();
    const m = meta();
    const check = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const shownPrice = promoActive() ? promoPrice(p.price) : p.price;
    const wasHtml = promoActive() ? `<span class="was">${usd(p.price)}</span> ` : "";
    $("summaryPanel").innerHTML = `
      <div class="sum-hero">
        <div class="sum-hero-lbl">${t("co.totalDueToday")}</div>
        <div class="sum-hero-price">${wasHtml}${usd(shownPrice)}</div>
        <div class="sum-hero-note">${p.name} · ${usd(p.cap)} ${t("packages.simCapital")}</div>
        ${promoActive() ? `<span class="price-promo-tag">${t("packages.promoTag").replace("{pct}", PROMO.percent).replace("{code}", PROMO.code)}</span>` : ""}
      </div>
      <div class="sum-split">
        <div class="sum-split-bar"><div class="sum-split-fill" style="width:${m.profitSplit}%"></div></div>
        <div class="sum-split-lbl"><span>${t("stats.split")}</span><b>${m.profitSplit}% ${t("co.yours")}</b></div>
      </div>
      <div class="sum-row"><span class="k">${t("co.maxEntrySize")}</span><span class="v">${usd(m.maxStake)}</span></div>
      <p class="sum-recur">${usd(shownPrice)} ${t("co.todaySuffix")} ${t("co.recurLine")}</p>
      <ul class="sum-feats">
        <li>${check}${t("co.featPhases")}</li>
        <li>${check}${t("co.featPartner")}</li>
        <li>${check}${t("co.featWithdraw")}</li>
        <li>${check}${t("co.featResetPrefix")} ${usd(m.resetFee)} ${t("co.featResetSuffix")}</li>
        <li>${check}${t("co.featSports")}</li>
      </ul>
      <p class="sum-note">${t("co.oneTimeNoSub")}<br />${t("co.simDisclosure")}</p>

      <div class="sum-block">
        <h4 class="sum-block-h">${t("co.whatHappens")}</h4>
        <ol class="sum-steps">
          <li><span class="n">1</span>${t("co.whStep1")}</li>
          <li><span class="n">2</span>${t("co.whStep2")}</li>
          <li><span class="n">3</span>${t("co.whStep3")}</li>
        </ol>
      </div>

      <div class="sum-badges">
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6v-4l5-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.2 7.3l1.7 1.7 3-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>${t("co.secureCheckout")}</span>
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M8.5 1.5L3 8.5h4l-1.5 5L11 6.5H7l1.5-5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>${t("co.instantAccess")}</span>
        <a href="https://t.me/+420608187811" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4v3l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>${t("gs.badgeSupport")}</a>
        <a href="refund" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 5.5L1.5 8l2.5 2.5M1.5 8h7a3.5 3.5 0 0 0 0-7H6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>${t("co.refundPolicy")}</a>
      </div>
      <p class="sum-company">${t("shared.companyLine")}</p>

      <div class="sum-block">
        <h4 class="sum-block-h">${t("co.howMoneyWorks")}</h4>
        <p class="sum-block-p">${t("co.moneyExplainer")}</p>
        <div class="sum-math">
          <div class="sum-math-cell"><span class="k">${t("co.onProfitKeep")}</span><span class="v green">$${(10000 * m.profitSplit / 100).toLocaleString("en-US")}</span></div>
        </div>
      </div>`;
  }

  // ---------- step navigation ----------
  const checkDot = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function goToStep(n) {
    state.step = n;
    [1, 2, 3].forEach((i) => {
      // While the payment embed pre-loads (see preparePayment) its panel stays
      // in the layout, off-screen — a display:none panel would make Whop lay
      // the form out at zero width.
      const warm = i === 3 && n !== 3 && pay.key !== null;
      $("step" + i).hidden = i !== n && !warm;
      $("step" + i).classList.toggle("prewarm", warm);
      const li = document.querySelector(`.co-step[data-step-dot="${i}"]`);
      li.classList.toggle("active", i === n);
      li.classList.toggle("done", i < n);
      li.querySelector(".dot").innerHTML = i < n ? checkDot : String(i);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
    // sticky mobile bar only makes sense on step 1 (browsing packages) — a
    // "price + continue" bar during sign-up/payment would be confusing.
    mobileBar.classList.toggle("show", n === 1 && window.scrollY > 260);
    if (n === 3) {
      if (typeof fbq === "function") {
        fbq("track", "AddPaymentInfo", {
          content_ids: [state.pkg],
          content_name: pkg().name,
          currency: "USD",
          value: pkg().price,
        });
      }
      startPayment();
    }
  }

  $("btnToStep2").addEventListener("click", () => {
    if (typeof fbq === "function") {
      fbq("track", "InitiateCheckout", {
        content_ids: [state.pkg],
        content_name: pkg().name,
        currency: "USD",
        value: pkg().price,
      });
    }
    goToStep(2);
  });
  $("btnBack1").addEventListener("click", () => goToStep(1));
  $("btnBack2").addEventListener("click", () => goToStep(2));
  $("btnBack3").addEventListener("click", (e) => { e.preventDefault(); goToStep(2); });

  // ---------- step 2: sign-up validation ----------
  const regForm = $("regForm");
  const regEmail = $("regEmail");
  const regPass = $("regPass");
  const regPass2 = $("regPass2");
  const consentTerms = $("consentTerms");
  const consentRules = $("consentRules");
  const consentCoolingOff = $("consentCoolingOff");

  function setErr(input, errEl, msg) {
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
    if (input) input.classList.toggle("invalid", Boolean(msg));
  }

  function validate() {
    let ok = true;
    const email = regEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr(regEmail, $("errEmail"), t("co.errInvalidEmail"));
      ok = false;
    } else setErr(regEmail, $("errEmail"), null);

    if (regPass.value.length < 8) {
      setErr(regPass, $("errPass"), t("co.errPasswordLength"));
      ok = false;
    } else setErr(regPass, $("errPass"), null);

    // "Confirm password" was dropped (one field less to type on a phone; the
    // show/hide toggle covers typos) — still validated if the field returns.
    if (regPass2) {
      if (regPass2.value !== regPass.value || !regPass2.value) {
        setErr(regPass2, $("errPass2"), t("co.errPasswordMismatch"));
        ok = false;
      } else setErr(regPass2, $("errPass2"), null);
    }

    if (!consentTerms.checked || !consentRules.checked || !consentCoolingOff.checked) {
      setErr(null, $("errConsent"), t("co.errConsent"));
      ok = false;
    } else setErr(null, $("errConsent"), null);

    return ok;
  }

  // Start loading the payment form as soon as a valid e-mail is typed, so by
  // the time the customer has entered a password and ticked the consents the
  // embedded checkout is already fully rendered off-screen.
  function preloadFromEmailField() {
    if (!(typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled())) return;
    const email = regEmail.value.trim();
    if (EMAIL_RE_WL.test(email)) preparePayment(state.pkg, email);
  }
  regEmail.addEventListener("blur", preloadFromEmailField);
  regEmail.addEventListener("change", preloadFromEmailField);

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;

    state.email = regEmail.value.trim();
    const btn = $("btnRegister");
    btn.disabled = true;
    btn.textContent = t("co.creatingAccount");

    // Without the backend (placeholders in config.js) the original demo mode stays.
    if (!(typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled())) {
      Portfolio.init(state.pkg);
      window.location.href = "dashboard";
      return;
    }

    // Make sure the payment form is loading (usually already loaded by the
    // e-mail field's blur, see preloadFromEmailField) — in parallel with the
    // Supabase sign-up below, which doesn't depend on it.
    preparePayment(state.pkg, state.email);

    // Clear any stale session first (e.g. a leftover login from an earlier
    // browser test with a different e-mail) — otherwise, if signUp/signIn
    // below fails silently, the browser keeps whatever OLD session was
    // active. Payment still succeeds (the webhook links the new account by
    // e-mail, not by browser session), but the dashboard's RLS-scoped query
    // then reads the wrong user's account and shows "no active challenge"
    // even though the new paid account genuinely exists in the DB.
    await FundlyAuth.signOut();

    // Sign-up is best-effort: the payment session only needs the e-mail,
    // so a signUp error (rate limit, existing account) does not block payment.
    // If it fails because the e-mail is already registered (repeat customer
    // buying another package, or a retried attempt), fall back to signing in
    // with the entered password — otherwise the browser reaches step 3 with
    // no session at all, and after payment dashboard.html finds no user and
    // bounces to the homepage instead of the new/updated account.
    try {
      const consentAt = new Date().toISOString();
      const { error } = await FundlyAuth.signUpWithPassword(state.email, regPass.value, {
        termsAt: consentAt,
        rulesAt: consentAt,
        coolingOffAt: consentAt,
        pkg: state.pkg,
        lang: document.documentElement.lang || "en",
      });
      if (error) {
        console.warn("signUp:", error.message);
        try {
          const signIn = await FundlyAuth.signInWithPassword(state.email, regPass.value);
          if (signIn.error) console.warn("signIn fallback:", signIn.error.message);
        } catch (err) {
          console.warn("signIn fallback failed:", err);
        }
      } else {
        if (typeof fbq === "function") fbq("track", "CompleteRegistration", { content_name: "checkout_signup" });
        // Genuinely new account (not the signIn fallback for a repeat
        // customer) — best-effort welcome e-mail with the NEWFUNDLY code,
        // fired without blocking the checkout flow on it.
        fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/checkout-welcome-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: state.email }),
        }).catch((err) => console.warn("checkout-welcome-email:", err));
      }
    } catch (err) {
      console.warn("signUp failed:", err);
    }
    btn.disabled = false;
    btn.innerHTML = `${t("co.completeSignup")}
      <svg class="arr" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7.5h10m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    goToStep(3);
  });

  // ---------- step 3: embedded Whop checkout ----------
  const payLoading = $("payLoading");
  const whopMount = $("whopMount");
  const payFallback = $("payFallback");
  const paySlow = $("paySlow");

  // The embedded checkout is the slowest thing in the funnel (session request
  // ~0.5 s, then whop.com's own page 1.5-5 s on a phone), and it used to start
  // only once the customer reached step 3 — on top of that the spinner was
  // dropped as soon as the iframe *element* existed, leaving a blank black box
  // for seconds (Clarity showed people tapping on it). Now: it starts loading
  // as early as the e-mail is known (off-screen, see goToStep/.prewarm), the
  // spinner stays until Whop reports its content has rendered, and a "try
  // again" hint appears if that takes long.
  const pay = { key: null, session: null, ready: false, startedAt: 0, timer: null, observer: null, onMsg: null };
  const payKey = (pkgKey, email) => pkgKey + "|" + String(email).trim().toLowerCase();

  // Return URL after payment (the site also runs under the /fundly/ path on GitHub Pages).
  function returnUrl() {
    return location.origin + location.pathname.replace(/[^/]*$/, "") + "dashboard?paid=1";
  }

  function stopPayWatch() {
    clearInterval(pay.timer);
    if (pay.observer) { pay.observer.disconnect(); pay.observer = null; }
    if (pay.onMsg) { window.removeEventListener("message", pay.onMsg); pay.onMsg = null; }
  }

  // Off-screen "warm" state of the payment panel while it pre-loads on steps 1-2
  // (on step 3 the normal show/hide in goToStep applies).
  function syncPayPanel() {
    if (state.step === 3) return;
    const warm = pay.key !== null;
    $("step3").hidden = !warm;
    $("step3").classList.toggle("prewarm", warm);
  }

  // Forget any pre-loaded/started payment (package or e-mail changed, retry).
  function clearPay() {
    stopPayWatch();
    pay.key = null;
    pay.session = null;
    pay.ready = false;
    whopMount.innerHTML = "";
    whopMount.classList.remove("is-loading");
    payLoading.hidden = false;
    payFallback.hidden = true;
    paySlow.hidden = true;
    syncPayPanel();
  }

  function showFallback(msg, checkoutUrl) {
    stopPayWatch();
    payLoading.hidden = true;
    paySlow.hidden = true;
    whopMount.innerHTML = "";
    // Whop's hosted page can't pre-apply the code, so tell the customer to enter it.
    const hint = promoActive()
      ? " " + t("co.fallbackCodeHint").replace("{code}", PROMO.code).replace("{pct}", PROMO.percent)
      : "";
    $("payErrMsg").textContent = (msg || t("co.gatewayError")) + hint;
    const link = $("payFallbackLink");
    if (checkoutUrl) {
      link.href = checkoutUrl;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    payFallback.hidden = false;
  }

  function markPayReady() {
    if (pay.ready) return;
    pay.ready = true;
    stopPayWatch();
    whopMount.classList.remove("is-loading");
    payLoading.hidden = true;
    paySlow.hidden = true;
  }

  function mountWhopEmbed(sessionId, planId, email) {
    // Mount element per the Whop docs (embedded checkout, HTML/JS variant)
    const el = document.createElement("div");
    el.setAttribute("data-whop-checkout-plan-id", planId);
    el.setAttribute("data-whop-checkout-session", sessionId);
    el.setAttribute("data-whop-checkout-return-url", returnUrl());
    el.setAttribute("data-whop-checkout-theme", "dark");
    el.setAttribute("data-whop-checkout-theme-accent-color", "#14f195");
    // Shows GBP/EUR/etc. pricing to non-US visitors automatically (Whop's own
    // live FX, no separate currency plans needed) — UK traffic sees £, not $.
    el.setAttribute("data-whop-checkout-adaptive-pricing", "true");
    // The site advertises the discounted price ($49 with NEWFUNDLY, ...) but the
    // fixed Whop plans charge list price, so without this the payment form
    // showed $70 and the customer had to find "Add promo code" and type the code
    // themselves. Whop's loader forwards it as `promoCode` and applies it before
    // the buyer sees the price. (Checked live: total drops by exactly 30 %.)
    if (typeof promoActive === "function" && promoActive()) {
      el.setAttribute("data-whop-checkout-promo-code", PROMO.code);
    }
    // ...and the e-mail was already typed in step 2 — don't ask for it again.
    if (email) el.setAttribute("data-whop-checkout-prefill-email", email);
    whopMount.innerHTML = "";
    whopMount.classList.add("is-loading");
    whopMount.appendChild(el);

    pay.startedAt = Date.now();
    // Ready = Whop's embed reports a rendered height (its "resize" message), or
    // — safety net — 2.5 s after the iframe's own load event.
    pay.onMsg = (ev) => {
      let origin = "";
      try { origin = new URL(ev.origin).hostname; } catch (_) { return; }
      if (!/(^|\.)whop\.com$/.test(origin)) return;
      let d = ev.data;
      if (typeof d === "string") { try { d = JSON.parse(d); } catch (_) { return; } }
      if (d && d.event === "resize" && Number(d.height) > 120) setTimeout(markPayReady, 150);
    };
    window.addEventListener("message", pay.onMsg);
    pay.observer = new MutationObserver(() => {
      const iframe = whopMount.querySelector("iframe");
      if (!iframe || iframe.dataset.watched) return;
      iframe.dataset.watched = "1";
      iframe.addEventListener("load", () => setTimeout(markPayReady, 2500), { once: true });
    });
    pay.observer.observe(whopMount, { childList: true, subtree: true });

    // The loader is re-inserted every time so it picks up the new mount element.
    const old = document.querySelector('script[src*="js.whop.com/static/checkout/loader.js"]');
    if (old) old.remove();
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = "https://js.whop.com/static/checkout/loader.js";
    s.onerror = () => showFallback(t("co.gatewayError"), state.checkoutUrl);
    document.head.appendChild(s);

    // Soft hint after 8 s (only once the customer is actually looking at
    // step 3), hard fallback to the hosted Whop page after 25 s.
    pay.timer = setInterval(() => {
      if (pay.ready) return;
      const elapsed = Date.now() - pay.startedAt;
      if (elapsed >= 25000) showFallback(t("co.gatewayErrorRetry"), state.checkoutUrl);
      else if (elapsed >= 8000 && state.step === 3) paySlow.hidden = false;
    }, 250);
  }

  // Create the Whop session and mount the embed (idempotent per package+e-mail).
  // Errors are stored, not thrown, so an unused rejected promise never surfaces
  // as an unhandled rejection — startPayment() checks for the marker.
  function preparePayment(pkgKey, email) {
    const key = payKey(pkgKey, email);
    if (pay.key === key) return pay.session;
    clearPay();
    pay.key = key;
    payLoading.hidden = false;
    syncPayPanel();
    pay.session = FundlyCheckout.createSession(pkgKey, email)
      .then((data) => {
        if (pay.key !== key) return data; // superseded while the request was in flight
        state.checkoutUrl = data.checkoutUrl;
        if (!data.sessionId || !data.planId) throw new Error(t("co.errInvalidGatewayResponse"));
        mountWhopEmbed(data.sessionId, data.planId, email);
        return data;
      })
      .catch((err) => ({ __error: err }));
    return pay.session;
  }

  async function startPayment() {
    if (state.paymentRunning) return;
    state.paymentRunning = true;
    payFallback.hidden = true;

    try {
      let res = await preparePayment(state.pkg, state.email);
      if (res && res.__error) {
        // A pre-load can fail on its own — most commonly on mobile, when the
        // tab gets backgrounded/throttled while the customer is still filling
        // in the form. They're back in the foreground now, so retry once with
        // a clean slate instead of giving up on a stale failure.
        clearPay();
        res = await preparePayment(state.pkg, state.email);
      }
      if (res && res.__error) throw res.__error;
      if (pay.ready) {
        // Pre-loaded off-screen: an iframe that has just been revealed paints one
        // blank (black) frame first — let it settle behind the spinner instead of
        // showing that to the customer.
        payLoading.hidden = false;
        whopMount.classList.add("is-loading");
        setTimeout(() => {
          if (!pay.ready) return;
          whopMount.classList.remove("is-loading");
          payLoading.hidden = true;
        }, 450);
      } else {
        payLoading.hidden = false;
      }
    } catch (err) {
      if (err.code === "SOLD_OUT") {
        payLoading.hidden = true;
        whopMount.innerHTML = "";
        showSoldOut();
      } else {
        showFallback(err.message, state.checkoutUrl);
      }
    } finally {
      state.paymentRunning = false;
    }
  }

  $("payRetry").addEventListener("click", (e) => {
    e.preventDefault();
    clearPay();
    startPayment();
  });

  // ---------- mobile sticky bar (step 1 only) ----------
  const mobileBar = $("coMobileBar");
  $("coMbCta").addEventListener("click", () => $("btnToStep2").click());
  window.addEventListener("scroll", () => {
    mobileBar.classList.toggle("show", state.step === 1 && window.scrollY > 260);
  });

  // ---------- in-app browser (Facebook / Instagram) ----------
  // ~3/4 of the ad traffic arrives inside Meta's in-app browser, where 3-D Secure
  // card authentication often fails (a real customer's payment was declined with
  // "your bank could not verify your identity through 3D Secure") and Apple/Google
  // Pay are unavailable. Tell them once, on the payment step, and tag the Clarity
  // session so those recordings can be filtered.
  const inApp = /FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent || "");
  if (inApp) $("payInApp").hidden = false;
  try {
    if (typeof window.clarity === "function") {
      if (inApp) window.clarity("set", "in_app_browser", "1");
      const attr = typeof getAttribution === "function" ? getAttribution() : null;
      if (attr && attr.utm_content) window.clarity("set", "ad", String(attr.utm_content));
    }
  } catch (_) { /* tagging is best-effort */ }

  // ---------- init ----------
  function renderAll() {
    renderPkgGrid();
    renderDetails();
    renderCheckoutRow();
    renderSummary();
  }
  document.addEventListener("fundly:lang-changed", renderAll);

  renderAll();
  goToStep(1);
})();
