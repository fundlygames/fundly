/* Fundly × Supabase/Whop — thin client layer (loaded after js/config.js).
   supabase-js is fetched from CDN only when the backend is actually set up,
   so the demo mode without a backend stays unchanged. */

const FundlyBackend = (() => {
  let clientPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("Failed to load supabase-js."));
      document.head.appendChild(el);
    });
  }

  // Lazily creates a shared supabase client (or null without a backend).
  function getClient() {
    if (!fundlyBackendEnabled()) return Promise.resolve(null);
    if (!clientPromise) {
      clientPromise = (async () => {
        if (!window.supabase) {
          await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js");
        }
        return window.supabase.createClient(FUNDLY_SUPABASE_URL, FUNDLY_SUPABASE_ANON_KEY);
      })();
    }
    return clientPromise;
  }

  return { getClient };
})();

const FundlyCheckout = {
  // Creates a Whop checkout session via the edge function and returns the whole
  // response ({ checkoutUrl, sessionId, planId }) without redirecting — for embedded checkout.
  async createSession(packageKey, email) {
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/whop-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageKey, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.checkoutUrl) {
      throw new Error(data.error || "Could not open the payment gateway.");
    }
    return data;
  },

  // Creates a Whop checkout via the edge function and redirects to the hosted payment page.
  async buy(packageKey, email) {
    const data = await this.createSession(packageKey, email);
    window.location.href = data.checkoutUrl;
  },
};

const FundlyAuth = {
  // Magic link sign-in via e-mail (back to dashboard).
  async signInWithEmail(email) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend is not configured." } };
    const redirectTo = new URL("dashboard", window.location.href).href;
    return client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  },

  // Password sign-in (when filled in the modal; otherwise a magic link is used).
  async signInWithPassword(email, password) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend is not configured." } };
    return client.auth.signInWithPassword({ email, password });
  },

  // Sign-up with e-mail and password (checkout step 2 — account is created before payment).
  async signUpWithPassword(email, password) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend is not configured." } };
    return client.auth.signUp({ email, password });
  },

  // Zapomenuté heslo: pošle e-mail s odkazem na dashboard, kde si po
  // příchodu z odkazu (Supabase založí dočasnou "recovery" session) může
  // hráč rovnou nastavit nové heslo přes panel "Account settings" —
  // žádná zvláštní stránka pro to není potřeba.
  async resetPassword(email) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend is not configured." } };
    const redirectTo = new URL("dashboard", window.location.href).href;
    return client.auth.resetPasswordForEmail(email, { redirectTo });
  },

  // Po přihlášení heslem session vždy začíná na AAL1, i když má účet
  // zapnuté TOTP — Supabase to samo od sebe nevyžaduje, musí se to
  // zkontrolovat a domluvit ručně. Bez tohohle kroku zůstane session
  // navěky na AAL1 a všechny AAL2-vyžadující akce (změna hesla, vypnutí
  // MFA) tiše/natvrdo selžou, i když se uživatel nikdy nedozví proč.
  async mfaStepUpNeeded() {
    const client = await FundlyBackend.getClient();
    if (!client) return null;
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    if (data.nextLevel !== "aal2" || data.currentLevel === data.nextLevel) return null;
    const { data: factors } = await client.auth.mfa.listFactors();
    const factor = (factors?.totp || []).find((f) => f.status === "verified");
    if (!factor) return null;
    const challenge = await client.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error) return null;
    return { factorId: factor.id, challengeId: challenge.data.id };
  },

  async mfaVerify(factorId, challengeId, code) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend is not configured." } };
    return client.auth.mfa.verify({ factorId, challengeId, code });
  },

  async getUser() {
    const client = await FundlyBackend.getClient();
    if (!client) return null;
    const { data } = await client.auth.getUser();
    return data?.user ?? null;
  },

  async signOut() {
    const client = await FundlyBackend.getClient();
    if (!client) return;
    await client.auth.signOut();
  },
};

// ---------- password field show/hide toggle (global, works on any page) ----------
// Wrap a password <input> in <div class="pw-field">...<button data-pw-toggle>.
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pw-toggle]");
  if (!btn) return;
  const input = btn.closest(".pw-field")?.querySelector("input");
  if (!input) return;
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  btn.setAttribute("aria-pressed", String(!showing));
  btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});
