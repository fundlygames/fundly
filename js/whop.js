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
    let res;
    try {
      res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/whop-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageKey, email }),
      });
    } catch (networkErr) {
      // raw fetch() failure (offline, flaky mobile connection, tab was
      // backgrounded mid-request — Safari's own message for this is the
      // cryptic, untranslated "Load failed"). Never show the browser's raw
      // message to the customer — empty message here falls back to the
      // translated string in checkout.js's showFallback().
      throw new Error("");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.checkoutUrl) {
      const err = new Error(data.error || "Could not open the payment gateway.");
      err.code = data.code;
      throw err;
    }
    return data;
  },

  // Creates a Whop checkout via the edge function and redirects to the hosted payment page.
  async buy(packageKey, email) {
    const data = await this.createSession(packageKey, email);
    window.location.href = data.checkoutUrl;
  },
};

// "Remember this device" for 2FA (see mfaStepUpNeeded below) — a random id
// persisted per-browser, unrelated to the Supabase session itself, so it
// survives sign-out/sign-in on the same device.
const DEVICE_ID_KEY = "fundly:deviceId";
// crypto.randomUUID() needs a fairly recent browser (Safari 15.4+/March
// 2022) — on anything older it doesn't exist at all, so calling it threw,
// getDeviceId() always fell into the catch below and returned null, and
// the device was NEVER trusted no matter how many times trustThisDevice()
// ran. Real reported symptom: customer's desktop (modern browser) stopped
// asking for the 2FA code, but their phone kept asking every single time.
// This isn't a security-sensitive value (just a per-browser tag, not a
// secret), so a plain Math.random()-based fallback is fine.
function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return null; // localStorage unavailable (private mode etc.) — never trust, always ask for the code
  }
}

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
  // consent: volitelný záznam souhlasů z checkoutu (Terms 8.2 / Refund 2.2 —
  // waiver 14denní lhůty na odstoupení vyžaduje "aktivní consent checkbox
  // při checkoutu"). Uloží se do auth metadat uživatele jako právní důkaz
  // s časovou značkou, ne jen jako klientská validace bez stopy na serveru.
  async signUpWithPassword(email, password, consent) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend is not configured." } };
    const data = consent
      ? { consent_terms_at: consent.termsAt, consent_rules_at: consent.rulesAt, consent_cooling_off_waived_at: consent.coolingOffAt }
      : undefined;
    return client.auth.signUp({ email, password, options: data ? { data } : undefined });
  },

  // Zapomenuté heslo: pošle e-mail s odkazem na dashboard, kde si po
  // příchodu z odkazu (Supabase založí dočasnou "recovery" session) může
  // hráč rovnou nastavit nové heslo přes panel "Account settings" —
  // žádná zvláštní stránka pro to není potřeba.
  //
  // Volá vlastní edge funkci (request-password-reset), ne
  // client.auth.resetPasswordForEmail() přímo — ten posílá přes Supabase
  // vlastní mailer, který nemá nastavené vlastní SMTP a e-maily tak
  // nespolehlivě/vůbec nechodily. Naše funkce posílá stejným Resend
  // kanálem jako potvrzení nákupu, který už prokazatelně funguje.
  async resetPassword(email) {
    if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) {
      return { error: { message: "Backend is not configured." } };
    }
    try {
      const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) return { error: { message: "Could not send the reset e-mail." } };
      return { error: null };
    } catch (e) {
      return { error: { message: "Could not send the reset e-mail." } };
    }
  },

  // Po přihlášení heslem session vždy začíná na AAL1, i když má účet
  // zapnuté TOTP — Supabase to samo od sebe nevyžaduje, musí se to
  // zkontrolovat a domluvit ručně. Bez tohohle kroku zůstane session
  // navěky na AAL1 a všechny AAL2-vyžadující akce (změna hesla, vypnutí
  // MFA) tiše/natvrdo selžou, i když se uživatel nikdy nedozví proč.
  //
  // "Remember this device" (zákaznický feedback: kód se ptá při KAŽDÉM
  // přihlášení, i ze stejného zařízení) — Supabase samo o sobě žádnou
  // paměť zařízení nemá, takže než se vůbec zeptáme na kód, zkontrolujeme
  // mfa_trusted_devices: pokud tohle device_id má pro tohohle usera ještě
  // platný (nevypršelý) záznam, MFA výzvu úplně přeskočíme.
  async mfaStepUpNeeded() {
    const client = await FundlyBackend.getClient();
    if (!client) return null;
    const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return null;
    if (data.nextLevel !== "aal2" || data.currentLevel === data.nextLevel) return null;

    const deviceId = getDeviceId();
    if (deviceId) {
      try {
        const { data: userData } = await client.auth.getUser();
        const userId = userData?.user?.id;
        if (userId) {
          const { data: trusted } = await client
            .from("mfa_trusted_devices")
            .select("id, expires_at")
            .eq("user_id", userId)
            .eq("device_id", deviceId)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          if (trusted) {
            client.from("mfa_trusted_devices").update({ last_used_at: new Date().toISOString() }).eq("id", trusted.id).then(() => {});
            return null; // trusted device — skip the code prompt
          }
        }
      } catch (e) { /* lookup failed → fall through, ask for the code as usual */ }
    }

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

  // Volá se po úspěšném mfaVerify() — zapamatuje tohle zařízení na 30 dní,
  // ať se příště mfaStepUpNeeded() rovnou vrátí bez výzvy na kód.
  async trustThisDevice() {
    const client = await FundlyBackend.getClient();
    if (!client) return;
    const deviceId = getDeviceId();
    if (!deviceId) return;
    try {
      const { data: userData } = await client.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await client.from("mfa_trusted_devices").upsert(
        { user_id: userId, device_id: deviceId, expires_at: expiresAt, last_used_at: new Date().toISOString() },
        { onConflict: "user_id,device_id" },
      );
    } catch (e) { /* best-effort — a failed save just means the code is asked for again next time */ }
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
