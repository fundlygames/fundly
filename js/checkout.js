/* Fundly — checkout wizard (1 package selection → 2 sign up → 3 payment).
   Loaded after config.js, packages.js, portfolio.js and whop.js. */

(function () {
  "use strict";

  const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const usdSigned = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

  const $ = (id) => document.getElementById(id);

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
    if (!res.ok) throw new Error(data.error || "Could not join the waitlist.");
  }

  waitlistForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = waitlistEmail.value.trim();
    waitlistErr.hidden = true;
    if (!EMAIL_RE_WL.test(email)) {
      waitlistErr.textContent = "Enter a valid email address.";
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
        capBanner.textContent = "Launch spots are full — join the waitlist below, or continue below if you already have an invite.";
        capBanner.hidden = false;
        waitlistPanel.hidden = false;
      } else if (typeof data.spotsLeft === "number" && data.spotsLeft <= 5) {
        capBanner.textContent = `Only ${data.spotsLeft} launch spot${data.spotsLeft === 1 ? "" : "s"} left in this batch.`;
        capBanner.hidden = false;
      }
    } catch (e) {
      // Availability check is cosmetic UX only — a failure here must not block checkout.
    }
  }
  checkAvailability();

  // ---------- step 1: package cards ----------
  const pkgGrid = $("pkgGrid");

  function renderPkgGrid() {
    pkgGrid.innerHTML = PACKAGES.map((p) => {
      const m = packageMeta(p);
      return `
      <button type="button" role="radio" aria-checked="${p.key === state.pkg}"
        class="pkg-card ${p.key === state.pkg ? "active" : ""}" data-key="${p.key}">
        ${p.top ? '<span class="top-badge">TOP</span>' : ""}
        <span class="nm">${p.name}</span>
        <span class="cap">${usd(p.cap)}</span>
        <span class="specs">
          <span class="spec"><span class="k">Phase 1 target</span><span class="v green">${usdSigned(m.target1)}</span></span>
          <span class="spec"><span class="k">Max. stake</span><span class="v">${usd(m.maxStake)}</span></span>
        </span>
      </button>`;
    }).join("");
  }

  pkgGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".pkg-card");
    if (!card || card.dataset.key === state.pkg) return;
    state.pkg = card.dataset.key;
    renderPkgGrid();
    renderGoals();
    renderSummary();
  });

  // ---------- phase targets and limits ----------
  function renderGoals() {
    const m = meta();
    $("goalTarget1").textContent = usdSigned(m.target1);
    $("goalTarget2").textContent = usdSigned(m.target2);
    $("goalDrawdown").textContent = usdSigned(-m.drawdown);
    $("goalDaily").textContent = usdSigned(-m.dailyLoss);
  }

  // ---------- summary (right column) ----------
  function renderSummary() {
    const p = pkg();
    const m = meta();
    const check = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    $("summaryPanel").innerHTML = `
      <h3 class="sum-h">Summary</h3>
      <div class="sum-row sum-head"><span class="k">Package</span><span class="k">Capital</span></div>
      <div class="sum-row"><span class="v big">${p.name}</span><span class="v green big">${usd(p.cap)}</span></div>
      <div class="sum-row"><span class="k">Profit share</span><span class="v green">${m.profitSplit} %</span></div>
      <div class="sum-row"><span class="k">Max. stake</span><span class="v">${usd(m.maxStake)}</span></div>
      <div class="sum-row"><span class="k">${p.name} package</span><span class="v">${usd(p.price)}</span></div>
      <div class="sum-total"><span class="k">One-time fee</span><span class="v">${usd(p.price)}</span></div>
      <ul class="sum-feats">
        <li>${check}2 evaluation phases, 30 days each</li>
        <li>${check}Unlimited time as a Fundly Partner once funded</li>
        <li>${check}Profit withdrawals once you reach the Funded phase</li>
        <li>${check}Reset for just ${usd(m.resetFee)} if you fail</li>
        <li>${check}All sports</li>
      </ul>
      <p class="sum-note">One-time payment • No subscription</p>
      <div class="sum-badges">
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6v-4l5-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.2 7.3l1.7 1.7 3-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Secure payment</span>
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M8.5 1.5L3 8.5h4l-1.5 5L11 6.5H7l1.5-5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>Instant access</span>
      </div>`;
  }

  // ---------- step navigation ----------
  const checkDot = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  function goToStep(n) {
    state.step = n;
    [1, 2, 3].forEach((i) => {
      $("step" + i).hidden = i !== n;
      const li = document.querySelector(`.co-step[data-step-dot="${i}"]`);
      li.classList.toggle("active", i === n);
      li.classList.toggle("done", i < n);
      li.querySelector(".dot").innerHTML = i < n ? checkDot : String(i);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
      setErr(regEmail, $("errEmail"), "Enter a valid e-mail address.");
      ok = false;
    } else setErr(regEmail, $("errEmail"), null);

    if (regPass.value.length < 8) {
      setErr(regPass, $("errPass"), "Password must be at least 8 characters long.");
      ok = false;
    } else setErr(regPass, $("errPass"), null);

    if (regPass2.value !== regPass.value || !regPass2.value) {
      setErr(regPass2, $("errPass2"), "Passwords do not match.");
      ok = false;
    } else setErr(regPass2, $("errPass2"), null);

    if (!consentTerms.checked || !consentRules.checked || !consentCoolingOff.checked) {
      setErr(null, $("errConsent"), "Please confirm all three consents to continue.");
      ok = false;
    } else setErr(null, $("errConsent"), null);

    return ok;
  }

  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!validate()) return;

    state.email = regEmail.value.trim();
    const btn = $("btnRegister");
    btn.disabled = true;
    btn.textContent = "Creating account…";

    // Without the backend (placeholders in config.js) the original demo mode stays.
    if (!(typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled())) {
      Portfolio.init(state.pkg);
      window.location.href = "dashboard";
      return;
    }

    // Sign-up is best-effort: the payment session only needs the e-mail,
    // so a signUp error (rate limit, existing account) does not block payment.
    try {
      const consentAt = new Date().toISOString();
      const { error } = await FundlyAuth.signUpWithPassword(state.email, regPass.value, {
        termsAt: consentAt,
        rulesAt: consentAt,
        coolingOffAt: consentAt,
      });
      if (error) console.warn("signUp:", error.message);
    } catch (err) {
      console.warn("signUp failed:", err);
    }
    btn.disabled = false;
    btn.innerHTML = `Complete sign up
      <svg class="arr" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7.5h10m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    goToStep(3);
  });

  // ---------- step 3: embedded Whop checkout ----------
  const payLoading = $("payLoading");
  const whopMount = $("whopMount");
  const payFallback = $("payFallback");

  // Return URL after payment (the site also runs under the /fundly/ path on GitHub Pages).
  function returnUrl() {
    return location.origin + location.pathname.replace(/[^/]*$/, "") + "dashboard?paid=1";
  }

  function showFallback(msg, checkoutUrl) {
    payLoading.hidden = true;
    whopMount.innerHTML = "";
    $("payErrMsg").textContent = msg || "The payment gateway could not be loaded.";
    const link = $("payFallbackLink");
    if (checkoutUrl) {
      link.href = checkoutUrl;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    payFallback.hidden = false;
  }

  function mountWhopEmbed(sessionId, planId) {
    // Mount element per the Whop docs (embedded checkout, HTML/JS variant)
    const el = document.createElement("div");
    el.setAttribute("data-whop-checkout-plan-id", planId);
    el.setAttribute("data-whop-checkout-session", sessionId);
    el.setAttribute("data-whop-checkout-return-url", returnUrl());
    el.setAttribute("data-whop-checkout-theme", "dark");
    el.setAttribute("data-whop-checkout-theme-accent-color", "#14f195");
    whopMount.innerHTML = "";
    whopMount.appendChild(el);

    // The loader is re-inserted every time so it picks up the new mount element.
    const old = document.querySelector('script[src*="js.whop.com/static/checkout/loader.js"]');
    if (old) old.remove();
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = "https://js.whop.com/static/checkout/loader.js";
    s.onerror = () => showFallback("The payment gateway could not be loaded.", state.checkoutUrl);
    document.head.appendChild(s);

    // Wait for the embed iframe; if it does not appear within 20 s, show the fallback.
    let waited = 0;
    const timer = setInterval(() => {
      waited += 500;
      const iframe = whopMount.querySelector("iframe");
      if (iframe) {
        clearInterval(timer);
        payLoading.hidden = true;
      } else if (waited >= 20000) {
        clearInterval(timer);
        showFallback("The payment gateway could not be loaded. Please try again, or pay directly on Whop.", state.checkoutUrl);
      }
    }, 500);
  }

  async function startPayment() {
    if (state.paymentRunning) return;
    state.paymentRunning = true;
    payLoading.hidden = false;
    payFallback.hidden = true;
    whopMount.innerHTML = "";

    try {
      const data = await FundlyCheckout.createSession(state.pkg, state.email);
      state.checkoutUrl = data.checkoutUrl;
      if (!data.sessionId || !data.planId) {
        throw new Error("The payment gateway returned an invalid response.");
      }
      mountWhopEmbed(data.sessionId, data.planId);
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

  // ---------- legal / rules modal ----------
  const DOCS = {
    rules: {
      title: "Challenge rules",
      body: `
        <h4>Phase 1 — Challenge</h4>
        <ul>
          <li>Time limit: 30 days</li>
          <li>Profit target: +10 % of capital</li>
          <li>Max. overall loss: −10 % (static — floor never moves)</li>
          <li>Max. daily loss: no limit</li>
          <li>Min. 5 winning tickets, each with a net profit of at least +0.5 % of capital</li>
        </ul>
        <h4>Phase 2 — Verification</h4>
        <ul>
          <li>Time limit: 30 days · Profit target: +5 %</li>
          <li>Same drawdown and qualifying-ticket rules as Phase 1</li>
        </ul>
        <h4>Funded account</h4>
        <ul>
          <li>Profit split: you keep 80 % of profits</li>
          <li>No time limit · Max. overall loss −10 % (static)</li>
        </ul>
        <h4>Payouts</h4>
        <ul>
          <li>Profit buffer of at least +5 % before your first payout</li>
          <li>Min. 5 qualifying winning tickets (≥ +0.5 % each)</li>
          <li>Max. $4,000 per payout · you receive 80 % (80/20 split)</li>
          <li>Identity verification (KYC) via Whop required before payout</li>
        </ul>
        <h4>Forbidden strategies</h4>
        <ul>
          <li>Arbitrage &amp; mispricing exploitation across outcomes</li>
          <li>Latency exploitation of stale data feeds</li>
          <li>Max. stake per ticket: 1.5 % of capital</li>
        </ul>`,
    },
    terms: {
      title: "Terms and conditions",
      body: `
        <p>Fundly Games is an educational, statistical data research, and performance-evaluation simulation platform — not a bookmaker, gambling operator, or financial institution. Participants never stake their own funds; the one-time evaluation fee is the only payment, and all account metrics are 100% simulated with zero real-world monetary value.</p>
        <p>Accounts are personal and non-transferable. Abuse of the platform (forbidden strategies, multi-accounting, exploitation of technical errors) leads to account termination without payout.</p>
        <p>The service is intended for persons over 18 years of age. Read the full <a href="terms" target="_blank" rel="noopener">Terms and Conditions</a>.</p>`,
    },
    privacy: {
      title: "Privacy policy",
      body: `
        <p>We process your email address and account data solely to operate the service (account management, payouts, fraud prevention). Payment data is processed by Whop; we never see your card details.</p>
        <p>We do not sell personal data. You can request export or deletion of your data at any time by contacting support. Read the full <a href="privacy" target="_blank" rel="noopener">Privacy Policy</a>.</p>`,
    },
    refund: {
      title: "Refund & cancellation",
      body: `
        <p>Because you get immediate access to the simulation software, purchasing an Evaluation Package and checking this box waives your 14-day statutory cooling-off right the moment you log into the dashboard or submit your first simulated entry.</p>
        <p>If you never log in and never place a single entry, you can still request a full refund within 14 days at support@fundly.games. Breached accounts are non-refundable but eligible for a 40% discounted reset. Read the full <a href="refund" target="_blank" rel="noopener">Refund and Cancellation Policy</a>.</p>`,
    },
  };
  const docModal = $("docModal");
  document.querySelectorAll("[data-doc]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const doc = DOCS[a.dataset.doc];
      if (!doc) return;
      $("docTitle").textContent = doc.title;
      $("docBody").innerHTML = doc.body;
      docModal.hidden = false;
    })
  );
  const closeDoc = () => (docModal.hidden = true);
  $("docClose").addEventListener("click", closeDoc);
  docModal.addEventListener("click", (e) => e.target === docModal && closeDoc());
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDoc());

  // ---------- init ----------
  renderPkgGrid();
  renderGoals();
  renderSummary();
  goToStep(1);
})();
