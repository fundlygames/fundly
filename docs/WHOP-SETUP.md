# Fundly × Whop — návod k nasazení

Kompletní postup, jak z nového prázdného Supabase projektu a Whop účtu
rozběhnout reálné platby, automatické zakládání účtů, admin reporting
a Meta ads spend. Doporučujeme nejdřív vše vyzkoušet ve Whop **sandboxu**
(`sandbox.whop.com`) a teprve potom přepnout na produkci.

## 0. Co budete potřebovat

- [Supabase](https://app.supabase.com) účet a **nový prázdný projekt**
- [Whop](https://whop.com) firemní účet (company) — nejdřív sandbox, pak produkce
- [Supabase CLI](https://supabase.com/docs/guides/cli) nainstalované lokálně
- (Volitelné) Meta Marketing API token + ID reklamního účtu

## 1. Whop: příprava

1. Ve Whop dashboardu (Developer sekce) vytvořte **Company API key** a poznačte si
   **Company ID** (`biz_...`).
2. Vytvořte produkt a v něm **5 plánů** — po jednom pro každý balíček
   (jednorázová platba `one_time`):

   | Balíček | Cena | Kapitál |
   |---|---|---|
   | Starter | 490 Kč | 10 000 Kč |
   | Standard | 890 Kč | 25 000 Kč |
   | Advanced | 1 590 Kč | 50 000 Kč |
   | Pro | 2 990 Kč | 100 000 Kč |
   | Elite | 4 990 Kč | 200 000 Kč |

   Poznačte si `plan_id` každého plánu (`plan_...`).
   (Bez plánů to poběží taky — funkce `whop-checkout` pak sestaví inline plan
   z ceny v kódu. Plány z dashboardu jsou ale čistší.)
3. Ověřte v sandboxu, že Whop umí měnu **CZK** (checkout i transfery ji podporují;
   potvrďte i pro váš payout způsob). Případně přepněte ceny do EUR/USD
   v `js/packages.js` i v `supabase/functions/_shared/packages.ts`.
4. Webhook zatím neregistrujte — URL budete znát až po nasazení funkcí (krok 4).

## 2. Supabase: projekt a secrets

1. Založte nový projekt na [app.supabase.com](https://app.supabase.com)
   a poznačte si **Project Reference** (`<PROJECT_REF>`) a **anon public key**
   (Settings → API).
2. V `supabase/config.toml` nahraďte `PLACEHOLDER_PROJECT_REF` skutečným refem.
3. Nastavte secrets pro edge funkce:

   ```bash
   supabase secrets set \
     WHOP_API_KEY=<company-api-key> \
     WHOP_COMPANY_ID=biz_... \
     WHOP_WEBHOOK_SECRET=whsec_... \
     WHOP_PLAN_STARTER=plan_... \
     WHOP_PLAN_STANDARD=plan_... \
     WHOP_PLAN_ADVANCED=plan_... \
     WHOP_PLAN_PRO=plan_... \
     WHOP_PLAN_ELITE=plan_... \
     ADMIN_API_KEY=<silné-náhodné-heslo-pro-admin>
   ```

   Volitelné (Meta ads spend):

   ```bash
   supabase secrets set \
     META_ACCESS_TOKEN=<token> \
     META_AD_ACCOUNT_ID=act_... \
     META_CURRENCY_RATE=1
   ```

   `WHOP_WEBHOOK_SECRET` získáte v kroku 4 při registraci webhooku — secrets
   lze nastavit i opakovaně, takže ho klidně doplňte dodatečně.
   `META_CURRENCY_RATE=1` předpokládá, že Meta účet reportuje v CZK; pokud
   reportuje v jiné měně, nastavte kurz do CZK (např. `25.2` pro USD→CZK).

## 3. Supabase: nasazení databáze a funkcí

V kořeni repozitáře:

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push          # aplikuje supabase/migrations/001_whop.sql
supabase functions deploy # nasadí všech 5 funkcí
```

Funkce: `whop-checkout`, `whop-webhook`, `admin-stats`, `meta-ads-spend`,
`whop-payout`.

## 4. Whop: registrace webhooku

1. Whop dashboard → Developer → Webhooks → přidejte endpoint:

   ```
   https://<PROJECT_REF>.supabase.co/functions/v1/whop-webhook
   ```

   API verze `v1`, události: `payment.succeeded`, `payment.failed`,
   `membership.went_valid`, `membership.went_invalid`.
2. Zkopírujte **webhook secret** (`whsec_...`) a doplňte ho:

   ```bash
   supabase secrets set WHOP_WEBHOOK_SECRET=whsec_...
   ```

## 5. Frontend: doplnění placeholderů

V `js/config.js` nahraďte:

```js
const FUNDLY_SUPABASE_URL = "https://<PROJECT_REF>.supabase.co";
const FUNDLY_SUPABASE_ANON_KEY = "<anon-public-key>";
```

Anon klíč je bezpečné zveřejnit — data chrání Row Level Security.
Pak commitněte a pushněte (GitHub Pages se nasadí samo).

## 6. Cron pro Meta ads spend

Supabase dashboard → Database → Cron (rozšíření pg_cron + pg_net) → nový job:

```sql
select cron.schedule('meta-ads-spend-daily', '0 6 * * *', $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/meta-ads-spend',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
```

Bez Meta secrets funkce vrací `{ "skipped": true }` a nic se neděje —
spend lze případně zapsat ručně přes SQL do tabulky `ad_spend`
(`channel = 'meta'`, `source = 'manual'`).

## 7. Sandbox end-to-end test (checklist)

1. Web běží s vyplněným `js/config.js` → na `index.html` klikněte
   **Koupit výzvu**, zadejte testovací e-mail → mělo by přesměrovat na
   Whop hosted checkout.
2. Zaplaťte **testovací kartou** ze sandboxu (seznam je ve Whop docs).
3. Po zaplacení Whop přesměruje na `dashboard.html?paid=1` → zobrazí se
   toast „Platba proběhla!".
4. Ve Whop sandbox dashboardu zkontrolujte doručení webhooku
   (`payment.succeeded` → HTTP 200).
5. V Supabase Table editoru ověřte nové řádky v `payments` a
   `challenge_accounts` (kapitál podle balíčku).
6. Na e-mail přijde **magic link** → po přihlášení dashboard načte reálný
   balíček z `challenge_accounts` (místo lokální simulace).
7. `admin.html` → zadejte `ADMIN_API_KEY` → Finance i Hráči ukazují reálná
   data, v „Marketingové kanály" je řádek **Meta Ads (reálný spend)**.
8. Po splnění podmínek financovaného účtu (stav `funded`) otestujte tlačítko
   **Vyplatit** → v tabulce `payouts` vznikne záznam s `whop_transfer_id`.
9. Teprve potom přepněte Whop klíče/webhook na **produkci** a opakujte
   kroky 2–5 s reálnou (malou) platbou.

## Poznámky

- Webhook handler je idempotentní (deduplikace přes `whop_payment_id`),
  Whop doručuje události aspoň jednou a občas mimo pořadí.
- Payout příjemce vyžaduje, aby měl hráč Whop účet a dokončené KYC —
  to řeší Whop payout flow na své straně, ne náš kód.
- Edge funkce mají vypnutou kontrolu Supabase JWT (`config.toml`),
  protože se ověřují vlastními mechanismy (podpis webhooku / `x-admin-key`).
