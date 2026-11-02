# 02 — Architektúra a frontend

## 1. Celkový obraz

```
 Návštevník ──▶ fundly.games (GitHub Pages, statické HTML/CSS/JS, bez buildu)
                  │
                  ├─▶ Supabase Auth ………………… prihlásenie (e-mail + heslo / magic link / MFA)
                  ├─▶ Supabase Edge Functions … biznis logika, kontrola, e-maily, platby (server = autorita)
                  │       └─▶ Supabase Postgres … účty, tikety, platby, výplaty (RLS; zápisy cez service role)
                  ├─▶ odds-api.io ………………… kurzy a výsledky zápasov (volá klient aj server)
                  └─▶ Whop (embedded checkout) ─ platba ─▶ webhook ─▶ whop-webhook ─▶ vznik účtu + e-mail
 pg_cron + pg_net ─▶ Edge Functions (odds-snapshot, settle-tickets, account-maintenance, email-followups, admin-report → monthly-run)
 Resend ……………… odosielanie všetkých e-mailov (Supabase vstavaný mailer je bez vlastného SMTP a limit 2 e-maily/hod → nepoužíva sa)
 Meta (pixel + CAPI) · Microsoft Clarity · Google Analytics (gtag) · Telegram widget
```

- **Žiadny build krok.** Čisté HTML/CSS/JS, skripty sa načítavajú priamo (`<script src="js/x.js?v=…">`). Hosting: GitHub Pages, doména `fundly.games` (súbor `CNAME`).
- **Repo:** `fundlygames/fundly`, vetva `main` = produkcia. Zmeny len cez PR (`CONTRIBUTING.md`, `.github/CODEOWNERS`).
- **Backend projekt:** Supabase `siruaytogfsgujpwzcsb` (URL a anon kľúč sú verejné v `js/config.js`; dáta chráni RLS).
- **Demo režim:** ak by v `js/config.js` ostali PLACEHOLDER hodnoty, web beží čisto lokálne (`fundlyBackendEnabled()` = false).

## 2. Stránky

| Stránka | Účel |
|---|---|
| `index.html` | Landing: hero, ako to funguje, balíčky, FAQ, leaderboard, kontakt, tlačidlo **Preview** (prehliadka dashboardu bez nákupu), e-mailový pop-up so zľavou (`discount-popup.js`) |
| `get-started.html` | Rozcestník „začnite" (`get-started.js`), vedie do checkoutu |
| `checkout.html` | 3 kroky: **1. Výber balíčka → 2. Registrácia (e-mail + súhlasy) → 3. Platba** (Whop embed). Logika `js/checkout.js` |
| `dashboard.html` | Hráčsky dashboard (jadro produktu), `js/dashboard.js` + `js/portfolio.js` |
| `admin.html` | Administrácia (`js/admin.js`), prístup cez admin kľúč alebo admin používateľa |
| `rules/terms/privacy/refund/disclaimer/aml/restricted-countries.html` | Právne texty (`css/legal.css`) |
| `unsubscribe.html` | Odhlásenie z marketingových e-mailov (HMAC token) |
| `dashboard-concept-1…5-*.html` | Dizajnové koncepty dashboardu (experimenty, nie produkcia) |

Štýly: `css/style.css` (spoločné), `checkout.css`, `dashboard.css`, `admin.css`, `get-started.css`, `legal.css`.
Jazyky UI: **en, cs, es, pl, sk, hu** (`js/i18n.js`, výber podľa prehliadača alebo `?lang=`, udalosť `fundly:lang-changed`).

## 3. JS moduly

| Súbor | Úloha |
|---|---|
| `config.js` | Supabase URL + anon kľúč, `fundlyBackendEnabled()` |
| `packages.js` | **Jediný zdroj pravdy** o balíčkoch (`PACKAGES`, `packageMeta()`, promo) |
| `portfolio.js` | API/cache vrstva pre odds-api.io + **stav portfólia** (zostatok, tikety, limity, fázy) v `localStorage` |
| `dashboard.js` | UI dashboardu: stávkový lístok, tikety, štatistiky, leaderboard, profil, výplaty, support, MFA |
| `whop.js` | `FundlyCheckout` (platba) a `FundlyAuth` (lazy-load supabase-js z CDN, prihlásenie, MFA, odhlásenie) |
| `checkout.js` | Funnel checkoutu, predpríprava platby po zadaní e-mailu, UTM atribúcia, Meta/Clarity udalosti |
| `main.js` | Interakcie landingu, Preview registrácia, plánovač balíčkov |
| `i18n.js` | Preklady a prepínač jazyka |
| `admin.js` | Admin UI (reporty, hráči, problémy, support, waitlist, affiliate, diagnostika, financie) |
| `promo-banner.js`, `discount-popup.js`, `telegram-widget.js` | Promo lišta, e-mailový pop-up, Telegram tlačidlo |

### Cache-bust
Všetky HTML majú `?v=YYYYMMDDx` na skriptoch a štýloch. **Pri každej zmene JS/CSS sa verzia zvýši na všetkých HTML** (naposledy `20261015a`),
inak prehliadače držia starý kód. Dôležité najmä pre dashboard (stará verzia = chýbajúca kontrola tiketov).

## 4. Dashboard a „local-first" portfólio

Hráčsky stav (`Portfolio` v `js/portfolio.js`) žije v `localStorage` (kľúč `bf2:portfolio`) a **zrkadlí sa na server**:

1. Hráč podá tiket → `Portfolio.placeBet()` odpočíta vklad, uloží lokálne.
2. `sync-tickets` pošle tikety na server (server ich **overí a môže stornovať**, viď 04), potom `sync-account` pošle súhrn (zostatok, fáza…).
3. Pri prvom načítaní / prázdnom `localStorage` volá `restore-account` a obnoví plný stav zo servera.
4. Server vyhodnocuje tikety aj sám (`settle-tickets` každých 10 min), klient si výsledky stiahne pri ďalšej synchronizácii (`applyServerSettlements`).

Dôležité vlastnosti:
- **Server je autorita:** zostatok sa nesmie prevziať od klienta bez podkladu v tabuľke `tickets`; fázu a stav `funded` nastavuje len server.
- **Pred podaním tiketu** klient znova stiahne čerstvé kurzy a stav zápasu (`refreshSlipFromApi`); ak sa kurz zmenil, ukáže „Odds changed" a hráč potvrdí.
- **Stornovaný tiket** (`push`, vklad späť) ukáže dôvod („Ticket voided, stake refunded").
- **Limity** (`breachInfo`, `dailyLossInfo`, `drawdownInfo`) počíta klient na zobrazenie a okamžité zablokovanie; **server ich počíta nezávisle** a účet zatvorí aj keď klient mlčí.
- **Bonusové dni a dĺžka fázy** (`phaseLengthDays`, `daysRemaining`) sa berú zo servera (`phase_bonus_days`).
- Po platbe (`?paid=1`) dashboard čaká na vznik účtu (webhook) a ak nie je prihlásenie, ukáže oznam „skontroluj e-mail" namiesto presmerovania.

Sekcie dashboardu: prehľad, stávkovanie (športy → ligy → zápasy → trhy → lístok, kombinované tikety, cash-out), tikety a história, štatistiky a odznaky
(badges), rebríček (leaderboard, voliteľne anonymný), profil a nastavenia (prezývka, heslo, 2FA/MFA, dôveryhodné zariadenia), výplaty (žiadosť, KYC),
support formulár, affiliate štatistiky (pre partnerov s promo kódom).

## 5. Tok „od reklamy po účet"

1. **Reklama (Meta) → landing/checkout.** UTM parametre sa uložia do `localStorage` (`fundly:attribution`) a posielajú sa s platbou.
2. **Checkout krok 2:** hráč zadá e-mail (platba sa v pozadí predpripraví po opustení poľa), zaškrtne súhlasy, vytvorí sa auth účet s náhodným heslom
   (heslo sa nezbiera), odíde uvítací e-mail (`checkout-welcome-email`). Bez hesla = menej trenia pred platbou.
3. **Krok 3:** `whop-checkout` vytvorí Whop session (plán podľa balíčka, promo kód, metadata s e-mailom a IP); hráč platí v embednutom formulári
   (karta, Apple/Google Pay, PayPal, Link, Revolut Pay, BLIK, P24 – podľa `WHOP_PAYMENT_METHODS`).
4. **Webhook** `payment.succeeded` → `whop-webhook`: overí podpis, zapíše platbu (`payments`), nájde/založí auth používateľa, **zabezpečí prístup**
   (viď 04 — overenie vlastníctva e-mailu), vytvorí `challenge_accounts` (`phase_started_at = teraz`), odošle Meta CAPI `Purchase`, pošle e-mail
   „Payment confirmed" s magic linkom.
5. **Návrat na `dashboard?paid=1`** → hráč je v účte (alebo klikne na odkaz z e-mailu).
6. **Cart recovery:** ak sa zaregistroval, ale nezaplatil, príde 1 e-mail 45 min – 48 h po registrácii (`email-followups`, trasa R).

## 6. Merania a marketing

- **Meta pixel + Conversions API** (`meta-capi.ts`): `CompleteRegistration` v checkoute, `Purchase` zo servera (s deduplikáciou cez event id).
  Testovacie udalosti: `META_TEST_EVENT_CODE`.
- **Microsoft Clarity** (heatmapy, nahrávky), **Google Analytics** (`gtag`), značky pre in-app prehliadače (FB/IG) pre diagnostiku.
- **E-mailové kampane** (Resend): popup so zľavou → `discount_signups`; trasy A/B/R follow-upov; `last50-reminder`; mesačné reporty (cron `monthly-report` → `admin-report` akcia `monthly-run`).
- Pozn.: k 15. 10. 2026 **žiadny reálny predaj od 23. 9.** — pozri `06-status-and-roadmap.md`.
