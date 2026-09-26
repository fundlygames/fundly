/* Discount pop-up (30% off, e-mail capture) — shared by index.html and get-started.html.
   Needs js/config.js, js/packages.js (PROMO), js/whop.js (getAttribution), js/i18n.js. */
// ---------- discount pop-up (30% off, e-mail capture) ----------
// Shows once ever per browser (localStorage flag, set the moment it's
// shown — not just on submit, so a closed/ignored popup doesn't nag again
// on the next visit). Triggered by exit-intent (mouse leaves toward the
// top of the viewport) on desktop, with a timed fallback for touch devices
// that never fire mouseout the same way. Nothing can trigger it before
// MIN_DELAY_MS: a mouseout toward the tab/address bar seconds after
// landing is completely normal navigation, not "about to leave" intent —
// without this gate the popup fired almost immediately on page load.
(() => {
  const modal = document.getElementById("discountModal");
  const form = document.getElementById("discountForm");
  if (!modal || !form) return;
  // číslo v grafice popupu se bere z PROMO (js/packages.js), ať se s kódem nerozjede
  const pctEl = modal.querySelector(".discount-pct");
  if (pctEl && pctEl.firstChild && typeof PROMO !== "undefined") pctEl.firstChild.textContent = PROMO.percent;
  const SEEN_KEY = "fundly:discountPopupSeen";
  const MIN_DELAY_MS = 5000;
  let readyAt = Date.now() + MIN_DELAY_MS;

  function showDiscountModal() {
    if (Date.now() < readyAt) return;
    if (localStorage.getItem(SEEN_KEY)) return;
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
    const authModalEl = document.getElementById("authModal");
    if (!modal.hidden || (authModalEl && !authModalEl.hidden)) return; // don't stack on top of the login modal
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeDiscountModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  document.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget && e.clientY <= 0) showDiscountModal();
  });
  setTimeout(showDiscountModal, MIN_DELAY_MS);

  document.getElementById("discountClose").addEventListener("click", closeDiscountModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeDiscountModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeDiscountModal(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = document.getElementById("discountNote");
    const btn = document.getElementById("discountSubmit");
    const email = document.getElementById("discountEmail").value.trim();
    btn.disabled = true;
    note.hidden = true;
    try {
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/discount-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang: (window.FUNDLY_I18N && FUNDLY_I18N.getLang && FUNDLY_I18N.getLang()) || null, attribution: typeof getAttribution === "function" ? getAttribution() : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send the code.");
      if (typeof fbq === "function") fbq("track", "Lead", { content_name: "discount_popup" });
      if (typeof gtag === "function") gtag("event", "generate_lead", { method: "discount_popup" });
      form.hidden = true;
      note.textContent = (typeof t === "function" ? t("discount.success") : "Code sent — check your inbox.");
      note.className = "auth-note";
      note.hidden = false;
    } catch (err) {
      note.textContent = err.message || "Could not send the code.";
      note.className = "auth-note error";
      note.hidden = false;
      btn.disabled = false;
    }
  });
})();
