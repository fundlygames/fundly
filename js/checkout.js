/* Fundly — checkout průvodce (1 výběr balíčku → 2 registrace → 3 platba).
   Načítá se po config.js, packages.js, portfolio.js a whop.js. */

(function () {
  "use strict";

  const czk = (n) => n.toLocaleString("cs-CZ") + " Kč";
  const czkSigned = (n) => (n > 0 ? "+" : "-") + Math.abs(n).toLocaleString("cs-CZ") + " Kč";

  const $ = (id) => document.getElementById(id);

  // ---------- stav ----------
  const state = {
    step: 1,
    pkg: "advanced",
    email: "",
    checkoutUrl: null,
    paymentRunning: false,
  };

  // Předvolba balíčku z URL (?package=elite), fallback na Advanced.
  const urlPkg = new URLSearchParams(window.location.search).get("package");
  if (urlPkg && PACKAGES.some((p) => p.key === urlPkg)) state.pkg = urlPkg;

  const pkg = () => packageByKey(state.pkg);
  const meta = () => packageMeta(pkg());

  // ---------- krok 1: karty balíčků ----------
  const pkgGrid = $("pkgGrid");

  function renderPkgGrid() {
    pkgGrid.innerHTML = PACKAGES.map(
      (p) => `
      <button type="button" role="radio" aria-checked="${p.key === state.pkg}"
        class="pkg-card ${p.key === state.pkg ? "active" : ""}" data-key="${p.key}">
        ${p.top ? '<span class="top-badge">TOP</span>' : ""}
        <span class="radio" aria-hidden="true"></span>
        <span class="nm">${p.name}</span>
        <span class="cap">${czk(p.cap)}</span>
      </button>`
    ).join("");
  }

  pkgGrid.addEventListener("click", (e) => {
    const card = e.target.closest(".pkg-card");
    if (!card || card.dataset.key === state.pkg) return;
    state.pkg = card.dataset.key;
    renderPkgGrid();
    renderGoals();
    renderSummary();
  });

  // ---------- cíle fází a limity ----------
  function renderGoals() {
    const m = meta();
    $("goalTarget1").textContent = czkSigned(m.target1);
    $("goalTarget2").textContent = czkSigned(m.target2);
    $("goalDrawdown").textContent = czkSigned(-m.drawdown);
  }

  // ---------- shrnutí (pravý sloupec) ----------
  function renderSummary() {
    const p = pkg();
    const m = meta();
    const check = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2.5 7.5l3 3 6-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    $("summaryPanel").innerHTML = `
      <h3 class="sum-h">Shrnutí</h3>
      <div class="sum-row sum-head"><span class="k">Balíček</span><span class="k">Kapitál</span></div>
      <div class="sum-row"><span class="v big">${p.name}</span><span class="v green big">${czk(p.cap)}</span></div>
      <div class="sum-row"><span class="k">Podíl na zisku</span><span class="v green">${m.profitSplit} %</span></div>
      <div class="sum-row"><span class="k">Max. sázka</span><span class="v">${czk(m.maxStake)}</span></div>
      <div class="sum-row"><span class="k">${p.name} balíček</span><span class="v">${czk(p.price)}</span></div>
      <div class="sum-total"><span class="k">Celkem</span><span class="v">${czk(p.price)}</span></div>
      <ul class="sum-feats">
        <li>${check}2 fáze evaluace</li>
        <li>${check}Neomezený čas jako tipér</li>
        <li>${check}Výběr zisku po dosažení Funded fáze</li>
        <li>${check}Všechny sporty</li>
      </ul>
      <p class="sum-note">Jednorázová platba • Bez měsíčních poplatků</p>
      <div class="sum-badges">
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6v-4l5-2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.2 7.3l1.7 1.7 3-3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Bezpečná platba</span>
        <span><svg width="14" height="14" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M8.5 1.5L3 8.5h4l-1.5 5L11 6.5H7l1.5-5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>Okamžitý přístup</span>
      </div>`;
  }

  // ---------- navigace mezi kroky ----------
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
    if (n === 3) startPayment();
  }

  $("btnToStep2").addEventListener("click", () => goToStep(2));
  $("btnBack1").addEventListener("click", () => goToStep(1));
  $("btnBack2").addEventListener("click", () => goToStep(2));
  $("btnBack3").addEventListener("click", (e) => { e.preventDefault(); goToStep(2); });

  // ---------- krok 2: validace registrace ----------
  const regForm = $("regForm");
  const regEmail = $("regEmail");
  const regPass = $("regPass");
  const regPass2 = $("regPass2");
  const consentTerms = $("consentTerms");
  const consentRules = $("consentRules");

  function setErr(input, errEl, msg) {
    errEl.textContent = msg || "";
    errEl.hidden = !msg;
    if (input) input.classList.toggle("invalid", Boolean(msg));
  }

  function validate() {
    let ok = true;
    const email = regEmail.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr(regEmail, $("errEmail"), "Zadejte platnou e-mailovou adresu.");
      ok = false;
    } else setErr(regEmail, $("errEmail"), null);

    if (regPass.value.length < 8) {
      setErr(regPass, $("errPass"), "Heslo musí mít alespoň 8 znaků.");
      ok = false;
    } else setErr(regPass, $("errPass"), null);

    if (regPass2.value !== regPass.value || !regPass2.value) {
      setErr(regPass2, $("errPass2"), "Hesla se neshodují.");
      ok = false;
    } else setErr(regPass2, $("errPass2"), null);

    if (!consentTerms.checked || !consentRules.checked) {
      setErr(null, $("errConsent"), "Pro pokračování potvrďte oba souhlasy.");
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
    btn.textContent = "Vytváření účtu…";

    // Bez backendu (placeholdery v config.js) zůstává původní demo režim.
    if (!(typeof fundlyBackendEnabled === "function" && fundlyBackendEnabled())) {
      Portfolio.init(state.pkg);
      window.location.href = "dashboard.html";
      return;
    }

    // Registrace je best-effort: platební relace potřebuje jen e-mail,
    // takže chyba signUpu (rate limit, už existující účet) platbu neblokuje.
    try {
      const { error } = await FundlyAuth.signUpWithPassword(state.email, regPass.value);
      if (error) console.warn("signUp:", error.message);
    } catch (err) {
      console.warn("signUp selhal:", err);
    }
    btn.disabled = false;
    btn.innerHTML = `Dokončit registraci
      <svg class="arr" width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M2.5 7.5h10m0 0l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    goToStep(3);
  });

  // ---------- krok 3: embedded Whop checkout ----------
  const payLoading = $("payLoading");
  const whopMount = $("whopMount");
  const payFallback = $("payFallback");

  // Návratová URL po platbě (web běží i pod cestou /fundly/ na GitHub Pages).
  function returnUrl() {
    return location.origin + location.pathname.replace(/[^/]*$/, "") + "dashboard.html?paid=1";
  }

  function showFallback(msg, checkoutUrl) {
    payLoading.hidden = true;
    whopMount.innerHTML = "";
    $("payErrMsg").textContent = msg || "Platební bránu se nepodařilo načíst.";
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
    // Mount element dle dokumentace Whop (embedded checkout, HTML/JS varianta)
    const el = document.createElement("div");
    el.setAttribute("data-whop-checkout-plan-id", planId);
    el.setAttribute("data-whop-checkout-session", sessionId);
    el.setAttribute("data-whop-checkout-return-url", returnUrl());
    el.setAttribute("data-whop-checkout-theme", "dark");
    el.setAttribute("data-whop-checkout-theme-accent-color", "#14f195");
    whopMount.innerHTML = "";
    whopMount.appendChild(el);

    // Loader se vloží pokaždé znovu, aby nový mount element načetl.
    const old = document.querySelector('script[src*="js.whop.com/static/checkout/loader.js"]');
    if (old) old.remove();
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = "https://js.whop.com/static/checkout/loader.js";
    s.onerror = () => showFallback("Platební bránu se nepodařilo načíst.", state.checkoutUrl);
    document.head.appendChild(s);

    // Čekáme na iframe embedu; když se do 20 s neobjeví, ukážeme fallback.
    let waited = 0;
    const timer = setInterval(() => {
      waited += 500;
      const iframe = whopMount.querySelector("iframe");
      if (iframe) {
        clearInterval(timer);
        payLoading.hidden = true;
      } else if (waited >= 20000) {
        clearInterval(timer);
        showFallback("Platební brána se nepodařila načíst. Zkuste to prosím znovu, nebo plaťte přímo na Whopu.", state.checkoutUrl);
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
        throw new Error("Platební brána vrátila neplatnou odpověď.");
      }
      mountWhopEmbed(data.sessionId, data.planId);
    } catch (err) {
      showFallback(err.message, state.checkoutUrl);
    } finally {
      state.paymentRunning = false;
    }
  }

  // ---------- init ----------
  // Placeholder odkazy v souhlasech (href="#") nescrollují nahoru
  document.querySelectorAll('.consent a[href="#"]').forEach((a) =>
    a.addEventListener("click", (e) => e.preventDefault())
  );
  renderPkgGrid();
  renderGoals();
  renderSummary();
  goToStep(1);
})();
