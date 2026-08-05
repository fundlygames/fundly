/* Fundly × Upcomers — interakce */

// data balíčků: viz js/packages.js (sdílené s dashboard.html)

const czk = (n) => n.toLocaleString("cs-CZ") + " Kč";
const czkSigned = (n) => (n > 0 ? "+" : "-") + Math.abs(n).toLocaleString("cs-CZ") + " Kč";

// ---------- picker ----------
const seg = document.getElementById("pkgSeg");
const phaseCards = document.getElementById("phaseCards");
const priceCard = document.getElementById("priceCard");
let activeKey = "advanced";

function renderSeg() {
  seg.innerHTML = PACKAGES.map(
    (p) => `<button role="radio" aria-checked="${p.key === activeKey}"
      class="${p.key === activeKey ? "active" : ""}" data-key="${p.key}">
      ${(p.cap / 1000).toLocaleString("cs-CZ")}K</button>`
  ).join("");
}

function renderPlan(animate) {
  const p = PACKAGES.find((x) => x.key === activeKey);
  const target1 = p.cap * 0.2;
  const target2 = p.cap * 0.1;
  const dd = p.cap * 0.08;
  const stake = p.cap * 0.04;

  phaseCards.innerHTML = `
    <article class="phase ${animate ? "pkg-anim" : ""}">
      <div class="ph-art" style="background-image:url(assets/card2-vyzva.jpg)" aria-hidden="true"></div>
      <div class="ph-body">
        <span class="ph-tag">Fáze 1</span>
        <div class="ph-name">Fundly výzva</div>
        <div class="ph-rows">
          <div class="ph-row"><span class="k">Cíl zisku</span><span class="v green">${czkSigned(target1)}</span></div>
          <div class="ph-row"><span class="k">Drawdown (trailing)</span><span class="v red">${czkSigned(-dd)}</span></div>
          <div class="ph-row"><span class="k">Časový limit</span><span class="v">30 dní</span></div>
          <div class="ph-row"><span class="k">Min. tiketů</span><span class="v">7</span></div>
        </div>
      </div>
    </article>
    <article class="phase ${animate ? "pkg-anim" : ""}" style="animation-delay:.05s">
      <div class="ph-art" style="background-image:url(assets/card2-verifikace.jpg)" aria-hidden="true"></div>
      <div class="ph-body">
        <span class="ph-tag">Fáze 2</span>
        <div class="ph-name">Verifikace</div>
        <div class="ph-rows">
          <div class="ph-row"><span class="k">Cíl zisku</span><span class="v green">${czkSigned(target2)}</span></div>
          <div class="ph-row"><span class="k">Drawdown (trailing)</span><span class="v red">${czkSigned(-dd)}</span></div>
          <div class="ph-row"><span class="k">Časový limit</span><span class="v">30 dní</span></div>
          <div class="ph-row"><span class="k">Min. tiketů</span><span class="v">7</span></div>
        </div>
      </div>
    </article>
    <article class="phase funded ${animate ? "pkg-anim" : ""}" style="animation-delay:.1s">
      <div class="ph-art" style="background-image:url(assets/card2-tiper.jpg)" aria-hidden="true"></div>
      <div class="ph-body">
        <span class="ph-tag">Financovaný účet</span>
        <div class="ph-name">Fundly tipér</div>
        <div class="ph-rows">
          <div class="ph-row"><span class="k">Váš podíl</span><span class="v green">80 %</span></div>
          <div class="ph-row"><span class="k">Drawdown (trailing)</span><span class="v red">${czkSigned(-dd)}</span></div>
          <div class="ph-row"><span class="k">Časový limit</span><span class="v">Neomezeno</span></div>
          <div class="ph-row"><span class="k">Kurzy</span><span class="v">1.00 až 8.00</span></div>
        </div>
      </div>
    </article>`;

  const check = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  priceCard.innerHTML = `
    <div class="${animate ? "pkg-anim" : ""}">
      <span class="pc-badge">Balíček ${p.name}</span>
      <div class="cap">${czk(p.cap)}<small>kapitál k dispozici</small></div>
    </div>
    <ul class="price-feats ${animate ? "pkg-anim" : ""}" style="animation-delay:.05s">
      <li>${check}2 fáze evaluace</li>
      <li>${check}80% podíl na zisku, s bonusy až 85 %</li>
      <li>${check}Max. vklad na tiket ${czk(stake)}</li>
      <li>${check}Neomezený čas na financovaném účtu</li>
      <li>${check}Žádný denní limit ztráty</li>
    </ul>
    <div class="price-row ${animate ? "pkg-anim" : ""}" style="animation-delay:.08s">
      <span class="amount">${p.price.toLocaleString("cs-CZ")}</span><span class="cur">Kč</span>
      <span class="per">jednorázově</span>
    </div>
    <button type="button" class="btn btn-primary" style="width:100%" data-auth="register">Koupit výzvu</button>
    <p class="price-note">Bez předplatného a skrytých poplatků</p>`;
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

// ---------- sportovní chipy (marquee) ----------
const SPORTS = [
  ["Fotbal", "FTB", "#2ecc71", "fotbal"],
  ["Hokej", "HOK", "#4a9dff", "hokej"],
  ["Tenis", "TEN", "#d97757", "tenis"],
  ["Basketbal", "BSK", "#ff9900", "basketbal"],
  ["MMA", "MMA", "#ff4d4d", "mma"],
  ["Formule 1", "F1", "#e82127", "f1"],
  ["Baseball", "MLB", "#0668e1", "baseball"],
  ["Esporty", "ESP", "#9945ff", "esporty"],
  ["Golf", "GLF", "#14f195", "golf"],
  ["Šipky", "DRT", "#a89fce", "sipky"],
  ["Stolní tenis", "STT", "#0092cf", "stolni-tenis"],
  ["Volejbal", "VOL", "#ffcc00", "volejbal"],
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
  track.innerHTML = half + half; /* zdvojené pro plynulou smyčku */
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
    title: "Přihlášení",
    sub: "Přihlaste se do svého účtu",
    submit: "Přihlásit se",
    switchText: "Nemáte účet?",
    switchBtn: "Zaregistrujte se",
    passAutocomplete: "current-password",
  },
  register: {
    title: "Registrace",
    sub: "Vytvořte si účet a začněte výzvu",
    submit: "Vytvořit účet",
    switchText: "Už máte účet?",
    switchBtn: "Přihlaste se",
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
    // S backendem vede nákup přes checkout průvodce, jinak původní demo.
    if (typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled()) {
      window.location.href = "checkout.html?package=" + encodeURIComponent(quickstart.dataset.quickstart);
      return;
    }
    Portfolio.init(quickstart.dataset.quickstart);
    window.location.href = "dashboard.html";
    return;
  }
  const trigger = e.target.closest("[data-auth]");
  if (trigger) {
    // Registrace = nákup: s backendem přesměrujeme do checkout průvodce.
    if (trigger.dataset.auth === "register" && typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled()) {
      window.location.href = "checkout.html?package=" + encodeURIComponent(activeKey);
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

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!authForm.reportValidity()) return;
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "login" ? "Přihlašování…" : "Vytváření účtu…";

  // S nakonfigurovaným backendem (js/config.js): registrace = reálná platba
  // přes Whop checkout, přihlášení = magic link na e-mail. Bez backendu
  // pokračuje původní lokální simulace níže.
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
      // heslo vyplněné → přímé přihlášení; prázdné → magic link na e-mail
      if (password) {
        FundlyAuth.signInWithPassword(email, password).then(({ error }) => {
          if (error) { fail("Nesprávný e-mail nebo heslo."); return; }
          window.location.href = "dashboard.html";
        }).catch(() => fail("Přihlášení se nepodařilo."));
      } else {
        FundlyAuth.signInWithEmail(email).then(({ error }) => {
          if (error) { fail(error.message); return; }
          authNote.textContent = "Odkaz pro přihlášení jsme poslali na váš e-mail.";
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
    window.location.href = "dashboard.html";
  }, 700);
});

// ---------- nav border při scrollu ----------
const nav = document.getElementById("nav");
const heroSentinel = new IntersectionObserver(
  ([e]) => nav.classList.toggle("scrolled", !e.isIntersecting),
  { rootMargin: "-72px 0px 0px 0px" }
);
const heroEl = document.querySelector(".hero");
if (heroEl) heroSentinel.observe(heroEl);
