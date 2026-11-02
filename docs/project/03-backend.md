# 03 — Backend (Supabase)

Projekt: `siruaytogfsgujpwzcsb`. Postgres + Auth + Edge Functions (Deno). Konfigurácia funkcií: `supabase/config.toml` (všetky s `verify_jwt = false` —
overenie robia funkcie samy: používateľský JWT cez `auth.getUser`, cron/admin cez tajný kľúč v hlavičke, webhook cez podpis).

## 1. Databáza

Zápisy robia takmer výhradne Edge Functions cez **service role**. Hráč smie cez RLS čítať len vlastné riadky; väčšina tabuliek nemá pre `anon`/`authenticated` žiadnu politiku
(migrácia 030 zamkla `monthly_reports`, `odds_snapshots` a zrušila verejné INSERT politiky).

| Tabuľka | Obsah |
|---|---|
| `challenge_accounts` | **Jadro.** Jeden riadok = jeden kúpený Challenge: `user_id`, `email`, `package_key`, `capital`, `phase` (1–3), `state` (`active`/`pending_approval`/`funded`/`breached`/`cancelled`), `phase_balance`, `profit`, `hwm`, `phase_baseline`, `phase_started_at`, `phase_bonus_days`, `day_start_*`, `qualifying_tickets`, `flags`, `risk_score`/`risk_reasons`/`watch_status`, `pending_phase`, `kyc_status`, `payout_method`, `last_ticket_at`, `inactivity_warned_*`, `phase_expiry_warned_for`, `admin_note`, `signup_ip`, `payment_fingerprint`, `nickname`, `leaderboard_opt_in`, `betting_profile`, `synced_at`… |
| `tickets` | Tikety (jeden riadok = tiket, `selections` ako jsonb, `stake`, `combined_odds`, `status` pending/won/lost/push/cashedout, `placed_at`, `settled_at`, `payout`, `first_start_time`, **`admission_note`** — dôvod stornovania). Unikát `(account_id, client_ticket_id)` |
| `payments` | Platby z Whopu (`whop_payment_id`, suma, mena, `whop_metadata`, `promo_code`, `affiliate`, `checkout_ip`, `payment_fingerprint`, stav odoslania Meta CAPI) |
| `payouts` | Žiadosti o výplatu a ich stav |
| `balance_sync_audit` | Audit synchronizácie zostatku (nárokovaný vs. serverom prepočítaný, zamietnuté) |
| `odds_snapshots` | Kurzy zápasov s otvorenými tiketmi (podklad pre detekciu zaostávajúceho feedu a CLV) |
| `affiliate_codes` | Affiliate promo kódy (zrkadlo kódov vo Whope) |
| `ad_spend`, `monthly_reports` | Výdavky na reklamu (Meta) a mesačné reporty |
| `waitlist`, `discount_signups`, `preview_signups` | Zbieranie leadov (čakacia listina, popup so zľavou, Preview) |
| `support_tickets` | Kontaktný formulár a odpovede supportu |
| `followup_sent`, `email_unsubscribes`, `last50_reminders_sent` | Evidencia odoslaných marketingových e-mailov a odhlásení |
| `email_throttle` | Limit frekvencie e-mailov na adresu (kľúč `druh:e-mail`) |
| `mfa_trusted_devices` | Dôveryhodné zariadenia pre 2FA |

SQL funkcie: `recent_signup_exists(email, minutes)` (031), `kick_user_sessions(uuid)` (032), pomocné pre RLS a admin (`admin_users` — admin cez Supabase Auth).

### Migrácie (`supabase/migrations/`)
001 Whop, 002 spôsoby výplat, 003 KYC, 004 synchronizácia účtu, 005 affiliate, 006 admin (`admin_users`), 007–008 riziko a pravidlá výplat, 009 support,
010 leaderboard, 011 nastavenia účtu, 012 mesačné reporty, 013 tikety, 014 odds snapshoty, 015 obnova účtu, 016 waitlist, 017 schvaľovanie fáz,
018–019 discount a Preview, 020 last50, 021 MFA zariadenia, 022 audit zostatku, 023 Meta CAPI, 024–026 follow-upy a cart recovery, 027 bonusové dni,
028 upozornenie na koniec fázy, 029 `admission_note`, 030 zamknutie tabuliek, 031 `email_throttle`, 032 `kick_user_sessions`.
Migrácie sa aplikujú **ručne** (SQL editor alebo Management API); súbor v repe je záznam, nie automatika.

## 2. Edge Functions

### Platby a účty
| Funkcia | Čo robí |
|---|---|
| `whop-checkout` | Vytvorí Whop checkout session (plán, promo, spôsoby platby, metadata e-mail/IP) |
| `whop-webhook` | Prijíma Whop webhooky (HMAC podpis `WHOP_WEBHOOK_SECRET`): zapíše platbu, nájde/založí auth používateľa, **zabezpečí prístup**, založí `challenge_accounts`, Meta CAPI, e-mail „Payment confirmed"; spracuje aj aktivačný poplatok a `membership.*` |
| `checkout-availability` | Koľko miest z launch kapacity ostáva |
| `checkout-welcome-email` | Uvítací e-mail s kódom po registrácii v checkoute (len krátko po reálnej registrácii, max. 1×/24 h) |
| `preview-signup` | Účet pre Preview (heslo od hráča); ak e-mail existuje, pošle prihlasovací odkaz |
| `request-password-reset` | Reset hesla cez Resend (rovnaká odpoveď bez ohľadu na existenciu účtu, 1×/60 s) |

### Hráčsky dashboard (volá klient s JWT)
| Funkcia | Čo robí |
|---|---|
| `sync-tickets` | **Prijíma tikety, vykoná kontrolu pri podaní (admission), uloží, stornuje neplatné**, po uložení vynúti limity straty |
| `sync-account` | Prijíma súhrn účtu; **stavový automat** (klient smie len `breached` / žiadosť o schválenie), kontrola zostatku proti tiketom, riziko-skóre, vynútenie limitov |
| `restore-account` | Vráti plný stav a tikety (obnova po strate `localStorage`); označí e-mail ako overený |
| `request-payout` | Žiadosť o výplatu (cap, odstup 14 dní, KYC, max. $4 000) |
| `profile-update` | Prezývka, súhlas s rebríčkom |
| `leaderboard-get` | Rebríček (anonymné „Player #xxxx" pokiaľ hráč nezdieľa meno) |
| `affiliate-stats` | Štatistiky promo kódov partnera |
| `support-submit`, `waitlist-join`, `discount-signup`, `email-unsubscribe` | Verejné formuláre |

### Admin (hlavička `x-admin-key` = `ADMIN_API_KEY`, alebo JWT admin používateľa)
`admin-stats` (tržby, platby, účty, payouty, Meta spend), `admin-report` (rozsah a mesačné reporty), `admin-account-tickets` (história tiketov hráča),
`approve-phase` (schválenie/zamietnutie postupu), `whop-payout` (vyplatenie cez Whop transfer), `affiliate-manage`, `support-manage`, `waitlist-manage`, `meta-ads-spend`.

### Cron (volané cez pg_cron + pg_net; chránené tajným kľúčom)
| Funkcia | Frekvencia | Čo robí |
|---|---|---|
| `settle-tickets` | každých 10 min | Vyhodnotí čakajúce tikety aj bez otvoreného dashboardu a po prehre skontroluje limity straty |
| `odds-snapshot` | každých 15 min | Uloží kurzy zápasov s otvorenými tiketmi |
| `email-followups` (`only: R`) | každých 15 min | Cart recovery e-mail |
| `email-followups` | denne 09:00 UTC | Follow-upy trasy A (nekúpili) a B (spálený účet); dni 3/10/17, max. 3 e-maily na osobu a trasu |
| `account-maintenance` | denne 05:00 UTC | Neaktivita funded účtov, **časový limit fáz + varovania**, **kontrola limitov straty** |
| `admin-report` → `monthly-run` | `monthly-report`, 1. v mesiaci 06:00 UTC | Mesačný report |

`account-maintenance` podporuje `{ "dry_run": true }` — len vypíše, koho by zatvoril.

## 3. Zdieľané moduly (`supabase/functions/_shared/`)

| Modul | Obsah |
|---|---|
| `packages.ts` | Balíčky/ceny/pravidlá na serveri (zrkadlo `js/packages.js`) |
| `ticket-admission.ts` | Kontrola tiketu pri podaní (statická + živá voči odds-api), tolerancie kurzov |
| `settle.ts`, `settle-verify.ts` | Vyhodnotenie výberov (1:1 s klientom) a overenie výsledku tiketu |
| `loss-limits.ts`, `loss-enforce.ts` | Výpočet a vynútenie −10 % / −4 % z tabuľky `tickets` |
| `phase-expiry.ts` | 30-dňový limit, varovanie, výnimky, „cieľ splnený" z tiketov |
| `payout-cap.ts` | Strop výplaty z preukázaného zisku |
| `mailbox.ts` | Overenie vlastníctva e-mailu (viď 04) |
| `risk.ts` | Server-side riziko-signály a `watchStatusFor()` |
| `email.ts`, `followup-emails.ts` | Resend + HTML šablóny (viacjazyčné follow-upy: en/cs/pl/…) |
| `throttle.ts` | `allow(key, minInterval)` — ochrana pred zaplavením cudzej schránky |
| `whop.ts`, `meta-capi.ts`, `capacity.ts`, `unsubscribe.ts`, `cors.ts`, `admin.ts` | Whop API, Meta CAPI, kapacita, HMAC odhlásenie, CORS, overenie admin kľúča |

## 4. Tajomstvá (secrets) — **len názvy**

Nastavujú sa cez `supabase secrets set`; hodnoty nikdy nepatria do repa ani do chatu.

| Skupina | Premenné |
|---|---|
| Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SITE_URL` |
| Whop | `WHOP_API_KEY`, `WHOP_COMPANY_ID`, `WHOP_WEBHOOK_SECRET`, `WHOP_PAYMENT_METHODS`, (plány: `WHOP_PLAN_*`) |
| E-maily | `RESEND_API_KEY`, `RESEND_FROM`, `SUPPORT_NOTIFY_EMAIL`, `UNSUBSCRIBE_SECRET`, `FOLLOWUP_START`, `FOLLOWUP_MAX_PER_RUN` |
| Prístup | `ADMIN_API_KEY`, `CRON_SECRET` |
| Kurzy | `ODDS_API_KEY`, `ODDS_API_BOOKMAKER` |
| Meta | `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`, `META_TEST_EVENT_CODE` |
| Kurzy mien | `EUR_USD_RATE`, `CZK_USD_RATE`, `GBP_USD_RATE` |
| Kapacita | `LAUNCH_CAPACITY`, `LAUNCH_SINCE` |
| **Vypínače** | `TICKET_ADMISSION_ENFORCE` (`false` = len loguje), `LOSS_LIMIT_ENFORCE` (`false` = len loguje), `PHASE_EXPIRY_ENFORCE` (`true` = ostrý režim), `PHASE_EXPIRY_EXCLUDE` (zoznam e-mailov) |

⚠️ Verejný kľúč odds-api.io je natvrdo v `js/portfolio.js` (klient volá API priamo; tarif má limit požiadaviek). Server používa ten istý kľúč v `ODDS_API_KEY`.
