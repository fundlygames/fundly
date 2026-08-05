/* Fundly × Supabase/Whop — tenká klientská vrstva (načítá se po js/config.js).
   supabase-js se z CDN stáhne až ve chvíli, kdy je backend skutečně nastaven,
   takže demo režim bez backendu zůstává beze změny. */

const FundlyBackend = (() => {
  let clientPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error("Nepodařilo se načíst supabase-js."));
      document.head.appendChild(el);
    });
  }

  // Líně vytvoří sdíleného supabase klienta (nebo null bez backendu).
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
  // Vytvoří Whop checkout session přes edge funkci a vrátí celou odpověď
  // ({ checkoutUrl, sessionId, planId }) bez přesměrování — pro embedded checkout.
  async createSession(packageKey, email) {
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/whop-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageKey, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.checkoutUrl) {
      throw new Error(data.error || "Platební bránu se nepodařilo otevřít.");
    }
    return data;
  },

  // Vytvoří Whop checkout přes edge funkci a přesměruje na hosted platební stránku.
  async buy(packageKey, email) {
    const data = await this.createSession(packageKey, email);
    window.location.href = data.checkoutUrl;
  },
};

const FundlyAuth = {
  // Přihlášení magic linkem na e-mail (zpět na dashboard.html).
  async signInWithEmail(email) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend není nastaven." } };
    const redirectTo = new URL("dashboard.html", window.location.href).href;
    return client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
  },

  // Přihlášení heslem (když je vyplněné v modalu; jinak se používá magic link).
  async signInWithPassword(email, password) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend není nastaven." } };
    return client.auth.signInWithPassword({ email, password });
  },

  // Registrace e-mailem a heslem (checkout krok 2 — účet se zakládá před platbou).
  async signUpWithPassword(email, password) {
    const client = await FundlyBackend.getClient();
    if (!client) return { error: { message: "Backend není nastaven." } };
    return client.auth.signUp({ email, password });
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
