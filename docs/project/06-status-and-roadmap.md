# 06 — Stav, otvorené body a história

> Stav k **15. 10. 2026** (posledná kontrola produkcie). Čísla a rozhodnutia nižšie treba pred použitím znova overiť.

## 1. Aktuálny stav

- **Produkcia beží:** web, checkout (platobná brána sa načíta, cena a promo kód sedia), dashboard, všetky cron joby (`succeeded`), odds-api funguje.
- **Hráči:** ~12 aktívnych účtov (väčšina Starter, 1 Advanced, 1 hráč vo fáze 2), všetci majú +7 bonusových dní (kompenzácia výpadku feedu v októbri).
- **Predaje:** posledný skutočný nákup **23. 9. 2026**. Reklamy sa v septembri minuli bez predaja; časť kampaní sa vypla a rozpočet sa znížil (~2k).
  Diagnostika (Clarity + Meta exporty) ukázala viacero problémov checkoutu (heslo pred platbou, pomalá brána, in-app prehliadače, kolízie e-mailov) — všetky opravené,
  **ešte však nikto nepotvrdil celý nákup po úpravách**.
- **Backend zabezpečený** (viď `04`): kontrola tiketov, nemenné tikety, server-side cash-out, stavový automat, limity straty, časový limit fáz, strop výplaty,
  overenie vlastníctva e-mailu, zamknuté tabuľky, e-mailové throttle.
- **Testovacie dáta:** demo účet `demo-test@fundly.games` zámerne ponechaný; ostatné testovacie účty a funkcie zmazané.

## 2. Otvorené rozhodnutia a úlohy

| # | Úloha | Kto | Poznámka |
|---|---|---|---|
| 1 | **Reálny testovací nákup** (`test` balíček) — platba → e-mail „Payment confirmed" → magic link → dashboard → `Purchase` v Meta Test events | majiteľ | Overí aj nové overenie e-mailu pri reálnom webhooku (nikdy sa nevolal naostro) |
| 2 | **Hráč `82fc93c4…` (Starter, fáza 2)** | majiteľ | Podozrenie na courtsiding (10 výhier vyhodnotených do ~3 min po podaní). **Neschválený** (poznámka v `admin_note`), termín fázy 17. 10.; čaká sa na rozhodnutie: stornovať výhry / zatvoriť |
| 3 | Rotácia/zrušenie osobných tokenov (Supabase, Cloudflare) použitých pri práci | majiteľ | Po dokončení prác |
| 4 | Opraviť uložené zostatky (staré chyby, nesedia s tiketmi) | AI/majiteľ | Jeden účet mal uložených $24 525 pri kapitále $2 000 |
| 5 | Skupina účtov jedného hráča so stavom `hold` (riziko 100–115, viac účtov na jednu osobu) | majiteľ | Prejsť v admine pred ďalším schválením fázy |
| 6 | Server-side limity straty pre **funded** účty (trailing od `hwm`) | AI | Zatiaľ len klient |
| 7 | Logovanie skutočnej chyby v `email-followups` (`catch` skrýva správu) | AI | Cron občas vráti 500 „Run failed" |
| 8 | Zvážiť OTP overenie e-mailu pred vznikom účtu | rozhodnutie | Zatiaľ sa kvôli konverzii overuje až pri prístupe po nákupe |
| 9 | Aktualizovať `AGENTS.md` a `docs/WHOP-SETUP.md` (zastarané ceny/balíčky) | AI | Viď nižšie |
| 10 | Pozrieť prvé reálne tikety po zapnutí kontroly (`admission_note` = `voided:`) | AI/majiteľ | Doteraz žiadny reálny tiket nebol stornovaný |

## 3. Zastarané / nezrovnalosti v dokumentácii

- **`AGENTS.md`** uvádza staré balíčky (Starter $400 … Elite $8 000, mesačné obnovy $20–$200). Skutočné balíčky sú **jednorazové** $70/$199/$400/$700/$1 250
  s kapitálom $2 000 – $100 000 (`js/packages.js`). Aj popis „Completed work" je stará záležitosť (vetva `feature/functional-betting-dashboard`).
- **`docs/WHOP-SETUP.md`** má ceny v Kč (490–4 990 Kč) a kapitály 10 000–200 000 Kč — nesedí s USD cenníkom.
- **Aktivačný poplatok $80** je len v `AGENTS.md` — overiť.
- **Známe drobnosti** (z `AGENTS.md`, nevyriešené): „Zisk" a „Do cíle" môžu hneď po postupe fázy pôsobiť protichodne; nevyriešené vklady sa v `netProfit` počítajú ako strata,
  kým sa nevyriešia; história zostatku a cache udalostí rastie bez limitu; hláška „Nejprve se přihlaste" je zavádzajúca pri vypnutom `localStorage`; text „Min. tiketů: 7" sa nevynucuje.

## 4. Nápady / možný ďalší vývoj
- Vlastný proxy pre odds-api (skrytie kľúča, cache, jednotné limity).
- Záloha: pravidelný export `challenge_accounts`/`tickets`/`payments`.
- Viac bookmakerov / športov (tarif odds-api je obmedzený na 2 bookmakerov; niektoré športy nemajú dáta).
- Affiliate program pre hráčov (odznak „Ambassador" je zatiaľ zamknutý).
- UGC tvorcovia (brief pripravený: 2 videá × 3 hooky, EN; rozpočet 3 000 Kč; zvažuje sa poľský trh), Trustpilot recenzie.
- Automatizované testy (dnes sú integračné skripty mimo repa) a CI kontrola TypeScriptu.

## 5. História (výber, 2026)

| Obdobie | Čo sa stalo |
|---|---|
| Júl–aug | Pôvodný React/Supabase (Lovable) prototyp archivovaný; nový statický web, funkčný dashboard, prop-firm redizajn, Whop platby, admin, affiliate, KYC, support, leaderboard |
| 22. 9. | Nález: uložený zostatok bez podkladu v tikety → serverová kontrola zostatku, audit |
| Sep | Reklamy bez predaja; diagnostika (Clarity, Meta); oprava checkoutu (bez hesla pred platbou, predpríprava platby, in-app oznam, kolízie e-mailov, cart recovery), OG obrázok pre zdieľanie, Trustpilot, UGC brief |
| 1. 10. | Mesačný report (september): reklamy + predaje z databázy, prezentácia pre firemný meeting |
| Okt (začiatok) | Výpadok odds-api (neobnovené členstvo) → +7 dní všetkým aktívnym hráčom a e-mail; Whop API kľúč vypršal → checkout `unauthorized`, opravené |
| Okt | Vynucovanie 30-dňového limitu a 3-dňové varovanie; diagnostika účtu a podozrenie na courtsiding |
| 14. 10. | **Kontrola tiketov pri podaní**, nemenné tikety, server-side cash-out, stavový automat, oprava `odds-snapshot`, zamknutie tabuliek, e-mailové throttle, strop výplaty |
| 15. 10. | **Limity straty na serveri**; demo účet; **overenie vlastníctva e-mailu** (nasadené) |

## 6. Kľúčové rozhodnutia a ich dôvody
- **Bez hesla pred platbou:** pole hesla odrádzalo studenú návštevnosť tesne pred platbou; heslo sa nastaví po nákupe alebo prihlásenie ide magic linkom.
- **Overenie e-mailu až pri prístupe, nie pred platbou:** nulové trenie pred platbou, bezpečnosť sa rieši pri pripojení nákupu k účtu.
- **Server ako autorita:** pravidlá, ktoré rozhodujú o výplate, nemôžu žiť len v prehliadači.
- **Fail-open pri nedostupnom odds-api:** radšej nepostihnúť poctivého hráča než zamietnuť tikety pri výpadku zdroja dát.
- **Bonusové dni (`phase_bonus_days`) namiesto posunu `phase_started_at`:** posun by pokazil kvalifikačné tikety a rekonciliáciu.
- **Vstavaný Supabase mailer sa nepoužíva:** všetky e-maily idú cez Resend z vlastných funkcií (limit 2/hod, bez SMTP).
