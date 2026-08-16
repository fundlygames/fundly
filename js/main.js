/* Fundly × Upcomers — interactions */

// package data: see js/packages.js (shared with dashboard)

const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const usdSigned = (n) => (n > 0 ? "+" : n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

// ---------- picker ----------
const seg = document.getElementById("pkgSeg");
const phaseCards = document.getElementById("phaseCards");
const priceCard = document.getElementById("priceCard");
let activeKey = "advanced";

function renderSeg() {
  seg.innerHTML = PACKAGES.map(
    (p) => `<button role="radio" aria-checked="${p.key === activeKey}"
      class="${p.key === activeKey ? "active" : ""}" data-key="${p.key}">
      ${p.cap >= 1000 ? `$${p.cap / 1000}K` : `$${p.cap}`}</button>`
  ).join("");
}

function renderPlan(animate) {
  const p = PACKAGES.find((x) => x.key === activeKey);
  const m = packageMeta(p);
  const target1 = m.target1;
  const target2 = m.target2;
  const dd = m.drawdown;
  const daily = m.dailyLoss;
  const stake = m.maxStake;

  phaseCards.innerHTML = `
    <article class="phase ${animate ? "pkg-anim" : ""}">
      <div class="ph-art" style="background-image:url(assets/card2-vyzva.jpg)" aria-hidden="true"></div>
      <div class="ph-body">
        <span class="ph-tag">Phase 1</span>
        <div class="ph-name">Fundly Challenge</div>
        <div class="ph-rows">
          <div class="ph-row"><span class="k">Profit target</span><span class="v green">${usdSigned(target1)}</span></div>
          <div class="ph-row"><span class="k">Max. loss (static)</span><span class="v red">${usdSigned(-dd)}</span></div>
          <div class="ph-row"><span class="k">Max. daily loss</span><span class="v red">${usdSigned(-daily)}</span></div>
          <div class="ph-row"><span class="k">Time limit</span><span class="v">30 days</span></div>
          <div class="ph-row"><span class="k">Qualifying tickets</span><span class="v">5 × ≥ +0.5 %</span></div>
        </div>
      </div>
    </article>
    <article class="phase ${animate ? "pkg-anim" : ""}" style="animation-delay:.05s">
      <div class="ph-art" style="background-image:url(assets/card2-verifikace.jpg)" aria-hidden="true"></div>
      <div class="ph-body">
        <span class="ph-tag">Phase 2</span>
        <div class="ph-name">Verification</div>
        <div class="ph-rows">
          <div class="ph-row"><span class="k">Profit target</span><span class="v green">${usdSigned(target2)}</span></div>
          <div class="ph-row"><span class="k">Max. loss (static)</span><span class="v red">${usdSigned(-dd)}</span></div>
          <div class="ph-row"><span class="k">Max. daily loss</span><span class="v red">${usdSigned(-daily)}</span></div>
          <div class="ph-row"><span class="k">Time limit</span><span class="v">30 days</span></div>
          <div class="ph-row"><span class="k">Qualifying tickets</span><span class="v">5 × ≥ +0.5 %</span></div>
        </div>
      </div>
    </article>
    <article class="phase funded ${animate ? "pkg-anim" : ""}" style="animation-delay:.1s">
      <div class="ph-art" style="background-image:url(assets/card2-tiper.jpg)" aria-hidden="true"></div>
      <div class="ph-body">
        <span class="ph-tag">Funded account</span>
        <div class="ph-name">Fundly bettor</div>
        <div class="ph-rows">
          <div class="ph-row"><span class="k">Your share</span><span class="v green">80 %</span></div>
          <div class="ph-row"><span class="k">Max. loss (trailing)</span><span class="v red">${usdSigned(-dd)}</span></div>
          <div class="ph-row"><span class="k">Max. daily loss</span><span class="v red">${usdSigned(-daily)}</span></div>
          <div class="ph-row"><span class="k">Time limit</span><span class="v">Unlimited</span></div>
          <div class="ph-row"><span class="k">Odds</span><span class="v">1.00 to 8.00</span></div>
        </div>
      </div>
    </article>`;

  const check = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  priceCard.innerHTML = `
    <div class="${animate ? "pkg-anim" : ""}">
      <span class="pc-badge">${p.name} package</span>
      <div class="cap">${usd(p.cap)}<small>capital at your disposal</small></div>
    </div>
    <ul class="price-feats ${animate ? "pkg-anim" : ""}" style="animation-delay:.05s">
      <li>${check}2 evaluation phases</li>
      <li>${check}80 % profit share</li>
      <li>${check}Max. stake per ticket ${usd(stake)}</li>
      <li>${check}Unlimited time on the funded account</li>
      <li>${check}Daily loss limit −4 % of capital</li>
    </ul>
    <div class="price-row ${animate ? "pkg-anim" : ""}" style="animation-delay:.08s">
      <span class="cur">$</span><span class="amount">${p.price.toLocaleString("en-US")}</span>
      <span class="per">one-time</span>
    </div>
    <button type="button" class="btn btn-primary" style="width:100%" data-auth="register">Buy the Challenge</button>
    <p class="price-note">One-time fee · 30 days per phase · no subscription</p>`;
}

if (seg) {
  renderSeg();
  renderPlan(false);
  seg.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-key]");
    if (!btn || btn.dataset.key === activeKey) return;
    activeKey = btn.dataset.key;
    renderSeg();
    renderPlan(true);
  });
}

// ---------- sports chips (marquee) ----------
const SPORTS = [
  ["Football", "FTB", "#2ecc71", "fotbal"],
  ["Hockey", "HOK", "#4a9dff", "hokej"],
  ["Tennis", "TEN", "#d97757", "tenis"],
  ["Basketball", "BSK", "#ff9900", "basketbal"],
  ["MMA", "MMA", "#ff4d4d", "mma"],
  ["Formula 1", "F1", "#e82127", "f1"],
  ["Baseball", "MLB", "#0668e1", "baseball"],
  ["Esports", "ESP", "#9945ff", "esporty"],
  ["Golf", "GLF", "#14f195", "golf"],
  ["Darts", "DRT", "#a89fce", "sipky"],
  ["Table tennis", "TT", "#0092cf", "stolni-tenis"],
  ["Volleyball", "VOL", "#ffcc00", "volejbal"],
];

document.querySelectorAll(".marquee-track[data-row]").forEach((track, i) => {
  const items = [...SPORTS.slice(i * 4), ...SPORTS.slice(0, i * 4)];
  const chip = ([name, abbr, color, icon]) => `
    <span class="chip">
      <span class="ic" style="--c:${color}">
        <img src="assets/sports/${icon}.png" alt="" width="30" height="30" />
      </span>
      <span class="nm"><b>${name}</b><span>${abbr}</span></span>
    </span>`;
  const half = items.map(chip).join("");
  track.innerHTML = half + half; /* duplicated for a smooth loop */
});

// ---------- FAQ ----------
document.querySelectorAll(".faq-item").forEach((item) => {
  const btn = item.querySelector(".faq-q");
  btn.addEventListener("click", () => {
    const open = item.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
});

// ---------- scroll reveal ----------
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.15 }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

// ---------- auth modal ----------
const authModal = document.getElementById("authModal");
const authTitle = document.getElementById("authTitle");
const authSub = document.getElementById("authSub");
const authSubmit = document.getElementById("authSubmit");
const authSwitchText = document.getElementById("authSwitchText");
const authSwitchBtn = document.getElementById("authSwitch");
const authNote = document.getElementById("authNote");
const authForm = document.getElementById("authForm");
const authPass = document.getElementById("authPass");
let authMode = "login";
let lastFocus = null;

const AUTH_TEXTS = {
  login: {
    title: "Log in",
    sub: "Log in to your account",
    submit: "Log in",
    switchText: "No account yet?",
    switchBtn: "Sign up",
    passAutocomplete: "current-password",
  },
  register: {
    title: "Sign up",
    sub: "Create an account and start the Challenge",
    submit: "Create account",
    switchText: "Already have an account?",
    switchBtn: "Log in",
    passAutocomplete: "new-password",
  },
};

function setAuthMode(mode) {
  authMode = mode;
  const t = AUTH_TEXTS[mode];
  authTitle.textContent = t.title;
  authSub.textContent = t.sub;
  authSubmit.textContent = t.submit;
  authSwitchText.textContent = t.switchText;
  authSwitchBtn.textContent = t.switchBtn;
  authPass.setAttribute("autocomplete", t.passAutocomplete);
  authNote.hidden = true;
  const forgotRow = document.getElementById("authForgotRow");
  if (forgotRow) forgotRow.hidden = mode !== "login";
}

function openAuth(mode) {
  lastFocus = document.activeElement;
  setAuthMode(mode);
  authForm.reset();
  authSubmit.disabled = false;
  authModal.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("authEmail").focus();
}

function closeAuth() {
  authModal.hidden = true;
  document.body.style.overflow = "";
  if (lastFocus) lastFocus.focus();
}

document.addEventListener("click", (e) => {
  const quickstart = e.target.closest("[data-quickstart]");
  if (quickstart) {
    e.preventDefault();
    // With the backend the purchase goes through the checkout wizard, otherwise the original demo.
    if (typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled()) {
      window.location.href = "checkout?package=" + encodeURIComponent(quickstart.dataset.quickstart);
      return;
    }
    Portfolio.init(quickstart.dataset.quickstart);
    window.location.href = "dashboard";
    return;
  }
  const trigger = e.target.closest("[data-auth]");
  if (trigger) {
    // Sign-up = purchase: with the backend we redirect into the checkout wizard.
    if (trigger.dataset.auth === "register" && typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled()) {
      window.location.href = "checkout?package=" + encodeURIComponent(activeKey);
      return;
    }
    openAuth(trigger.dataset.auth);
    return;
  }
  if (!authModal.hidden && e.target === authModal) closeAuth();
});
document.getElementById("authClose").addEventListener("click", closeAuth);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !authModal.hidden) closeAuth();
});
authSwitchBtn.addEventListener("click", () => setAuthMode(authMode === "login" ? "register" : "login"));

document.getElementById("authForgot")?.addEventListener("click", async () => {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) {
    authNote.textContent = "Enter your e-mail above first, then tap \"Forgot password?\" again.";
    authNote.hidden = false;
    document.getElementById("authEmail").focus();
    return;
  }
  if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
    authNote.textContent = "Password reset is unavailable in demo mode.";
    authNote.hidden = false;
    return;
  }
  const btn = document.getElementById("authForgot");
  btn.disabled = true;
  const { error } = await FundlyAuth.resetPassword(email);
  btn.disabled = false;
  authNote.textContent = error
    ? "Could not send the reset e-mail. Please try again."
    : "If that e-mail has an account, we sent a password reset link to it.";
  authNote.hidden = false;
});

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!authForm.reportValidity()) return;
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "login" ? "Logging in…" : "Creating account…";

  // With a configured backend (js/config.js): sign-up = real payment
  // via Whop checkout, login = magic link to the e-mail. Without a backend
  // the original local simulation below continues.
  if (typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled()) {
    const email = document.getElementById("authEmail").value.trim();
    const fail = (msg) => {
      authNote.textContent = msg;
      authNote.hidden = false;
      authSubmit.disabled = false;
      authSubmit.textContent = AUTH_TEXTS[authMode].submit;
    };
    if (authMode === "register") {
      FundlyCheckout.buy(activeKey, email).catch((err) => fail(err.message));
    } else {
      const password = document.getElementById("authPass").value;
      // password filled → direct sign-in; empty → magic link to the e-mail
      if (password) {
        FundlyAuth.signInWithPassword(email, password).then(({ error }) => {
          if (error) { fail("Incorrect e-mail or password."); return; }
          window.location.href = "dashboard";
        }).catch(() => fail("Login failed."));
      } else {
        FundlyAuth.signInWithEmail(email).then(({ error }) => {
          if (error) { fail(error.message); return; }
          authNote.textContent = "We sent a login link to your e-mail.";
          authNote.hidden = false;
          authSubmit.disabled = false;
          authSubmit.textContent = AUTH_TEXTS[authMode].submit;
        });
      }
    }
    return;
  }

  setTimeout(() => {
    if (authMode === "register") {
      Portfolio.init(activeKey);
    } else {
      Portfolio.ensure(activeKey);
    }
    window.location.href = "dashboard";
  }, 700);
});

// ---------- contact form ----------
const contactForm = document.getElementById("contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("contactSubmit");
    const note = document.getElementById("contactNote");
    btn.disabled = true;
    note.hidden = true;
    try {
      if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
        throw new Error("Support is temporarily unavailable — please email us directly.");
      }
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/support-submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: document.getElementById("contactEmail").value.trim(),
          subject: document.getElementById("contactSubject").value.trim(),
          message: document.getElementById("contactMessage").value.trim(),
          source: "contact_form",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The message could not be sent.");
      contactForm.reset();
      note.textContent = "Message sent — we'll get back to you by email.";
      note.hidden = false;
    } catch (err) {
      note.textContent = err.message || "The message could not be sent.";
      note.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- mobile menu ----------
const navBurger = document.getElementById("navBurger");
const mobileMenu = document.getElementById("mobileMenu");
if (navBurger && mobileMenu) {
  const closeMenu = () => {
    mobileMenu.hidden = true;
    navBurger.setAttribute("aria-expanded", "false");
  };
  navBurger.addEventListener("click", () => {
    const opening = mobileMenu.hidden;
    mobileMenu.hidden = !opening;
    navBurger.setAttribute("aria-expanded", String(opening));
  });
  // zavřít po kliku na odkaz/tlačítko uvnitř (anchor scroll, login, CTA)
  mobileMenu.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  // při zvětšení okna na desktop šířku menu samo zavřít, ať nezůstane
  // "otevřené" schované za media query
  window.addEventListener("resize", () => { if (window.innerWidth >= 1024) closeMenu(); });
}

// ---------- nav border on scroll ----------
const nav = document.getElementById("nav");
const heroSentinel = new IntersectionObserver(
  ([e]) => nav.classList.toggle("scrolled", !e.isIntersecting),
  { rootMargin: "-72px 0px 0px 0px" }
);
const heroEl = document.querySelector(".hero");
if (heroEl) heroSentinel.observe(heroEl);
