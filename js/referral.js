/* Fundly — program „Pozvi kamaráda" (doporučení hráčů).
   • Dashboard → Profil → Doporučení (#refPanel): osobní odkaz s tlačítky Kopírovat / Sdílet,
     3 kroky, statistiky (pozvaní / koupili / slevy k využití). Data: edge funkce referral-get
     (JWT, jen vlastní data hráče).
   • Pokladna (checkout.js): popisky slevy. Slevu vždy ověřuje a počítá server (whop-checkout →
     _shared/referral.ts); tady se jen zobrazuje. Kód z odkazu (?ref=KÓD) ukládá js/whop.js.
   • Odznak Ambasador (js/dashboard.js): FundlyReferral.ambassador() = aspoň jeden kamarád koupil.
   Pravidla: kamarád 10 % na první nákup; doporučitel 10 % na další balíček (i reset) za každého
   kamaráda, který zaplatil; slevy jsou jednorázové, nesčítají se, nejsou to peníze ani kredit.
   Texty: FUNDLY_I18N.extend (jmenný prostor "ref"), en + cs (sk přebírá češtinu). */
(function () {
  "use strict";

  const PCT = 10; // stejné jako REFERRAL_DISCOUNT_PCT v supabase/functions/_shared/referral.ts

  const STR = {
    en: {
      title: "Invite a friend",
      lead: "Share your personal link. Your friend gets 10 % off their first package, and for every friend who buys you get 10 % off your next package.",
      linkLabel: "Your referral link",
      code: "Code",
      copy: "Copy",
      copied: "Copied",
      share: "Share",
      shareText: "Get 10 % off your first Fundly package with my link:",
      step1T: "Send the link",
      step1D: "To a friend by message, chat or on social media.",
      step2T: "Your friend gets 10 % off",
      step2D: "Applied automatically at checkout (new customers only).",
      step3T: "You get 10 % off your next package",
      step3D: "One discount per friend who buys. Applied automatically to your next package or reset.",
      statInvited: "Invited",
      statPaid: "Bought",
      statVouchers: "Discounts to use",
      voucherReady: "Discounts ready to use: {n}. One is applied automatically to your next purchase (package or reset).",
      terms: "Discounts are not money or credit, are single-use, can't be combined with each other and can't be transferred. Details in the",
      termsLink: "Terms, section 4.7",
      loading: "Loading…",
      notEligible: "Your referral link appears here once you have a purchased account.",
      signIn: "Sign in to see your referral link.",
      demo: "The referral program works with a live account.",
      loadFail: "Referral data could not be loaded. Please try again later.",
      inactive: "Your referral link has been deactivated. If you think this is a mistake, contact support.",
      // pokladna
      coPending: "Friend's invite: extra −10 % at payment",
      coReferral: "−10 % with your friend's invite",
      coVoucher: "10 % off for an invited friend",
      coSelf: "You can't use your own referral link.",
      coExisting: "The friend's discount is for new customers only.",
      coUsed: "A friend's discount has already been used for this e-mail.",
      coInvalid: "This referral link is not valid.",
    },
    cs: {
      title: "Pozvi kamaráda",
      lead: "Pošli kamarádovi svůj osobní odkaz. Kamarád má 10 % slevu na svůj první balíček a ty za každého kamaráda, který si balíček koupí, získáš 10 % slevu na další balíček.",
      linkLabel: "Tvůj odkaz pro kamarády",
      code: "Kód",
      copy: "Kopírovat",
      copied: "Zkopírováno",
      share: "Sdílet",
      shareText: "Přes můj odkaz máš 10 % slevu na první balíček Fundly:",
      step1T: "Pošli odkaz",
      step1D: "Kamarádovi do zprávy, chatu nebo na sociální sítě.",
      step2T: "Kamarád má 10 % slevu",
      step2D: "Uplatní se mu automaticky při platbě (jen pro nové zákazníky).",
      step3T: "Ty 10 % na další balíček",
      step3D: "Jedna sleva za každého kamaráda, který koupí. Uplatní se automaticky u dalšího balíčku nebo resetu.",
      statInvited: "Pozvaní",
      statPaid: "Koupili",
      statVouchers: "Slevy k využití",
      voucherReady: "Slevy k využití: {n}. Jedna se automaticky uplatní při tvém dalším nákupu (balíček nebo reset).",
      terms: "Slevy nejsou peníze ani kredit, jsou jednorázové, nedají se sčítat ani převádět. Podrobnosti v",
      termsLink: "Obchodních podmínkách, čl. 4.7",
      loading: "Načítám…",
      notEligible: "Odkaz pro kamarády se ti tu zobrazí, jakmile budeš mít koupený účet.",
      signIn: "Přihlas se, ať uvidíš svůj odkaz pro kamarády.",
      demo: "Program Pozvi kamaráda funguje s ostrým účtem.",
      loadFail: "Údaje o doporučeních se nepodařilo načíst. Zkus to prosím později.",
      inactive: "Tvůj odkaz pro kamarády je deaktivovaný. Pokud jde podle tebe o omyl, napiš podpoře.",
      coPending: "Pozvánka od kamaráda: −10 % navíc při platbě",
      coReferral: "Sleva 10 % s pozvánkou od kamaráda",
      coVoucher: "Sleva 10 % za pozvaného kamaráda",
      coSelf: "Vlastní odkaz pro kamarády použít nejde.",
      coExisting: "Sleva od kamaráda platí jen pro nové zákazníky.",
      coUsed: "Sleva od kamaráda už byla na tento e-mail použita.",
      coInvalid: "Odkaz od kamaráda není platný.",
    },
  };

  const hasI18n = typeof FUNDLY_I18N !== "undefined";
  if (hasI18n) {
    FUNDLY_I18N.extend("en", { ref: STR.en, dashjs: { badgeHint: { ambassador: "Invite a friend who buys a package (Profile → Referrals)." } } });
    FUNDLY_I18N.extend("cs", { ref: STR.cs, dashjs: { badgeHint: { ambassador: "Pozvi kamaráda, který si koupí balíček (Profil → Doporučení)." } } });
  }
  const tr = (k) => (hasI18n ? FUNDLY_I18N.t("ref." + k) : STR.en[k]);
  const trf = (k, vars) => String(tr(k)).replace(/\{(\w+)\}/g, (m, v) => (vars && vars[v] !== undefined ? vars[v] : m));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  let data = null; // poslední odpověď referral-get

  const FundlyReferral = {
    pct: PCT,
    // cena po slevě — stejné zaokrouhlení jako discountedPrice() na serveru (jen pro zobrazení)
    price(listPrice) { return Math.round((listPrice * (100 - PCT)) / 100); },
    // kód z odkazu kamaráda uložený js/whop.js (nebo null)
    pendingCode() { return typeof getReferralCode === "function" ? getReferralCode() : null; },
    // popisek do pokladny: { text, muted } nebo null. discount/status = odpověď whop-checkout
    checkoutTag(discount, status) {
      if (discount && discount.kind === "voucher") return { text: tr("coVoucher"), muted: false };
      if (discount && discount.kind === "referral") return { text: tr("coReferral"), muted: false };
      const notes = { self: "coSelf", existing: "coExisting", used: "coUsed", invalid: "coInvalid" };
      if (status && notes[status]) return { text: tr(notes[status]), muted: true };
      if (!status && this.pendingCode()) return { text: tr("coPending"), muted: false };
      return null;
    },
    ambassador() { return !!(data && data.eligible && data.paid > 0); },
    getData() { return data; },
  };
  window.FundlyReferral = FundlyReferral;

  // ---------- dashboard panel ----------
  const panel = document.getElementById("refPanel");
  if (!panel) return;

  let state = { kind: "loading" }; // loading | message | ready

  function stepsHtml() {
    const step = (n) => `<li><span><b style="color:var(--text-primary)">${esc(tr(`step${n}T`))}</b><br>${esc(tr(`step${n}D`))}</span></li>`;
    return `<ol class="ol-steps" style="margin-top:16px">${step(1)}${step(2)}${step(3)}</ol>`;
  }

  function render() {
    let body = "";
    if (state.kind === "ready") {
      const d = state.data;
      const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
      const linkBlock = d.active
        ? `<label class="t-label" for="refLink" style="display:block;margin-top:14px">${esc(tr("linkLabel"))}</label>
          <div class="ref-box" style="flex-wrap:wrap;margin-top:6px">
            <input class="input" id="refLink" readonly value="${esc(d.link)}" style="min-width:0;flex:1 1 220px" />
            <button type="button" class="btn btn-primary" data-ref-copy>${esc(tr("copy"))}</button>
            ${canShare ? `<button type="button" class="btn btn-ghost" data-ref-share>${esc(tr("share"))}</button>` : ""}
          </div>
          <p class="t-meta" style="margin-top:6px">${esc(tr("code"))}: <b>${esc(d.code)}</b></p>`
        : `<p class="bet-msg" style="margin-top:14px">${esc(tr("inactive"))}</p>`;
      const available = Number(d.vouchers && d.vouchers.available) || 0;
      body = `${linkBlock}
        ${stepsHtml()}
        <div class="ref-stats">
          <div><div class="num">${Number(d.invited) || 0}</div><div class="lbl">${esc(tr("statInvited"))}</div></div>
          <div><div class="num green">${Number(d.paid) || 0}</div><div class="lbl">${esc(tr("statPaid"))}</div></div>
          <div><div class="num green">${available}</div><div class="lbl">${esc(tr("statVouchers"))}</div></div>
        </div>
        ${available > 0 ? `<p class="t-small" style="margin-top:12px">${esc(trf("voucherReady", { n: available }))}</p>` : ""}`;
    } else {
      body = `<p class="bet-msg" style="margin-top:14px">${esc(state.kind === "loading" ? tr("loading") : tr(state.msg))}</p>${stepsHtml()}`;
    }
    panel.innerHTML = `<h3>${esc(tr("title"))}</h3>
      <p class="t-small">${esc(tr("lead"))}</p>
      ${body}
      <p class="t-meta" style="margin-top:12px">${esc(tr("terms"))} <a href="terms" target="_blank" rel="noopener" style="color:var(--accent);font-weight:600">${esc(tr("termsLink"))}</a>.</p>`;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  panel.addEventListener("click", async (e) => {
    if (state.kind !== "ready") return;
    const link = state.data.link;
    const copyBtn = e.target.closest("[data-ref-copy]");
    if (copyBtn) {
      if (await copyText(link)) {
        copyBtn.textContent = tr("copied");
        setTimeout(() => { copyBtn.textContent = tr("copy"); }, 1800);
      } else {
        const input = document.getElementById("refLink");
        if (input) input.select();
      }
      return;
    }
    if (e.target.closest("[data-ref-share]")) {
      try {
        await navigator.share({ title: "Fundly", text: tr("shareText"), url: link });
      } catch (err) { /* zrušeno uživatelem */ }
    }
  });
  panel.addEventListener("focusin", (e) => { if (e.target.id === "refLink") e.target.select(); });

  async function load() {
    if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled() || typeof FundlyBackend === "undefined") {
      state = { kind: "message", msg: "demo" };
      return render();
    }
    try {
      const client = await FundlyBackend.getClient();
      const { data: sessionData } = client ? await client.auth.getSession() : { data: null };
      const token = sessionData && sessionData.session && sessionData.session.access_token;
      if (!token) { state = { kind: "message", msg: "signIn" }; return render(); }
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/referral-get`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { state = { kind: "message", msg: res.status === 401 ? "signIn" : "loadFail" }; return render(); }
      data = json;
      state = json.eligible ? { kind: "ready", data: json } : { kind: "message", msg: "notEligible" };
      render();
      // odznak Ambasador se odemyká z těchto dat → překreslit odznaky
      if (FundlyReferral.ambassador() && typeof renderBadges === "function" && typeof Portfolio !== "undefined") {
        const s = Portfolio.get();
        if (s) renderBadges(s);
      }
    } catch (e) {
      state = { kind: "message", msg: "loadFail" };
      render();
    }
  }

  render();
  document.addEventListener("fundly:lang-changed", render);
  // whop.js / config.js se načítají s defer (spustí se až po tomhle skriptu) → počkat na DOMContentLoaded
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
