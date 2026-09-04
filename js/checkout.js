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

  // Compact cards: name + capital + price only — everything else (targets,
  // limits, odds/days/split) lives in the details panel for the SELECTED
  // package only, so comparing 5 packages doesn't mean scanning 5x that data.
  function renderPkgGrid() {
    pkgGrid.innerHTML = PACKAGES.map((p) => `
      <button type="button" role="radio" aria-checked="${p.key === state.pkg}"
        class="pkg-card ${p.key === state.pkg ? "active" : ""}" data-key="${p.key}">
        ${p.top ? '<span class="top-badge">TOP</span>' : ""}
        <span class="nm">${p.name}</span>
        <span class="cap">${usd(p.cap)}</span>
        <span class="price">${usd(p.price)} <span class="lbl">one-time</span></span>
      </button>`).join("");
  }

  pkgGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".pkg-card");
    if (!card || card.dataset.key === state.pkg) return;
    state.pkg = card.dataset.key;
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
            Phase targets
          </h3>
          <div class="co-row"><span class="k">Phase 1</span><span class="v green">${usdSigned(m.target1)}</span></div>
          <div class="co-row"><span class="k">Phase 2</span><span class="v green">${usdSigned(m.target2)}</span></div>
        </div>
        <div class="co-box">
          <h3 class="co-box-h">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.5l5.5 10h-11L7 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M7 5.5v2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="7" cy="9.8" r=".8" fill="currentColor"/></svg>
            Limits
          </h3>
          <div class="co-row"><span class="k">Max. loss (static)</span><span class="v red">${usdSigned(-m.drawdown)}</span></div>
          <div class="co-row"><span class="k">Max. daily loss</span><span class="v red">${usdSigned(-m.dailyLoss)}</span></div>
          <p class="co-note">Static overall floor in the Challenge phases (trailing in Phase 3), plus a −4 % daily loss limit that resets at midnight UTC.</p>
        </div>
      </div>
      <div class="co-chips">
        <span class="co-chip">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1.5 10.5l3.5-3.5 2.5 2.5 5-5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Odds 1.00–8.00
        </span>
        <span class="co-chip">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4v3l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          30 days/phase
        </span>
        <span class="co-chip">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1.5v11M10 4c0-1.1-1.3-2-3-2s-3 .9-3 2 1.3 2 3 2 3 .9 3 2-1.3 2-3 2-3-.9-3-2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          ${m.profitSplit} % profit
        </span>
      </div>`;
  }

  // ---------- condensed checkout action row (selected package, right above Continue) ----------
  function renderCheckoutRow() {
    const p = pkg();
    $("coCheckoutRow").innerHTML = `
      <div class="co-checkout-pkg">
        <span class="nm">${p.name}</span>
        <span class="cap">${usd(p.cap)} simulated capital</span>
      </div>
      <div class="co-checkout-price">
        <span class="v">${usd(p.price)}</span>
        <span class="lbl">one-time fee</span>
      </div>`;
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
      <div class="sum-row"><span class="k">Performance split</span><span class="v green">${m.profitSplit} %</span></div>
      <div class="sum-row"><span class="k">Max. entry size</span><span class="v">${usd(m.maxStake)}</span></div>
      <div class="sum-total"><span class="k">One-time fee</span><span class="v">${usd(p.price)}</span></div>
      <p class="sum-recur">${usd(p.price)} today. No subscription. No recurring charges. You will never be charged again unless you purchase another Challenge.</p>
      <ul class="sum-feats">
        <li>${check}2 evaluation phases, 30 days each</li>
        <li>${check}Unlimited time as a Fundly Partner in Phase 3</li>
        <li>${check}Profit withdrawals once you reach Phase 3</li>
        <li>${check}Reset for just ${usd(m.resetFee)} if you fail</li>
        <li>${check}All sports</li>
      </ul>
      <p class="sum-note">One-time payment • No subscription<br />This is a simulated sports analytics environment. No real-money bets are placed through Fundly.</p>

      <div class="sum-block">
        <h4 class="sum-block-h">What happens after you pay</h4>
        <ol class="sum-steps">
          <li><span class="n">1</span>Your Fundly account is created and login details are ready instantly</li>
          <li><span class="n">2</span>Log in and submit your first simulated entry within minutes</li>
          <li><span class="n">3</span>Pass Phase 1 and Phase 2, then become a Fundly Partner</li>
        </ol>
      </div>

      <div class="sum-badges">
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6v-4l5-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.2 7.3l1.7 1.7 3-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Secure checkout</span>
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M8.5 1.5L3 8.5h4l-1.5 5L11 6.5H7l1.5-5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>Instant account access</span>
        <a href="https://t.me/+420608187811" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/><path d="M7 4v3l2 1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>24/7 support</a>
        <a href="refund" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M4 5.5L1.5 8l2.5 2.5M1.5 8h7a3.5 3.5 0 0 0 0-7H6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Refund policy</a>
      </div>
      <p class="sum-company">Operated by Grindit LLC · Company Reg. 2541536, UAE</p>

      <div class="sum-block">
        <h4 class="sum-block-h">How does the money work?</h4>
        <p class="sum-block-p">You never risk your own betting bankroll. Fundly provides a simulated account for evaluation — successful partners can qualify for performance rewards according to our rules.</p>
        <div class="sum-math">
          <div class="sum-math-cell"><span class="k">On $10,000 profit, you keep</span><span class="v green">$${(10000 * m.profitSplit / 100).toLocaleString("en-US")}</span></div>
        </div>
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
      });
      if (error) {
        console.warn("signUp:", error.message);
        try {
          const signIn = await FundlyAuth.signInWithPassword(state.email, regPass.value);
          if (signIn.error) console.warn("signIn fallback:", signIn.error.message);
        } catch (err) {
          console.warn("signIn fallback failed:", err);
        }
      }
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
    // Shows GBP/EUR/etc. pricing to non-US visitors automatically (Whop's own
    // live FX, no separate currency plans needed) — UK traffic sees £, not $.
    el.setAttribute("data-whop-checkout-adaptive-pricing", "true");
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

  // ---------- init ----------
  renderPkgGrid();
  renderDetails();
  renderCheckoutRow();
  renderSummary();
  goToStep(1);
})();
