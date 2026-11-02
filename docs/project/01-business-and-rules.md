# 01 — Produkt, ceny a pravidlá hry

> Zdroj pravdy v kóde: `js/packages.js` (klient) a `supabase/functions/_shared/packages.ts` (server). Autoritatívne znenie pre hráčov:
> `rules.html` a `terms.html`. Ak sa čísla v kóde a texte rozchádzajú, platí kód a text sa opraví.

## 1. Produkt a právny rámec

- **Čo hráč kupuje:** prístup k simulovanému účtu s virtuálnym kapitálom. Nejde o vklad ani o stávkovanie za skutočné peniaze.
- **Čo je „výplata":** po splnení oboch fáz je hráč „Fundly Partner" a jeho výkon sa odmieňa ako **contractor payout**
  (B2B vzťah s dodávateľom analytických služieb). Výplata ide cez Whop po KYC.
- **Prevádzkovateľ (podľa `rules.html`):** Grindit LLC, Sharjah Media City, Sharjah, UAE (reg. č. 2541536), podpora `support@fundly.games`.
- **Právne stránky:** `terms.html`, `rules.html`, `privacy.html`, `refund.html`, `disclaimer.html`, `aml.html`, `restricted-countries.html`.
  Pri nákupe hráč zaškrtáva súhlas s podmienkami, pravidlami a vzdaním sa 14-dňovej lehoty na odstúpenie (cooling-off) pri okamžitom plnení.

## 2. Balíčky a ceny

Jednorazová platba (nie predplatné). Ceny v USD; Whop v checkoute automaticky ukáže GBP/EUR/… (adaptive pricing).

| Balíček | Kapitál | Cena | S kódom NEWFUNDLY (−30 %) | Reset (40 %) |
|---|---:|---:|---:|---:|
| Starter | $2 000 | $70 | $49 | $28 |
| Standard | $10 000 | $199 | $139 | $80 |
| Advanced (TOP) | $25 000 | $400 | $280 | $160 |
| Pro | $50 000 | $700 | $490 | $280 |
| Elite | $100 000 | $1 250 | $875 | $500 |

- **Promo:** trvalý kód `NEWFUNDLY` (−30 %). Aplikuje sa automaticky cez atribút `data-whop-checkout-promo-code` v embednutej platbe;
  banner je v `js/promo-banner.js` (zrkadlí `PROMO` v `js/packages.js` — **obe kópie držať zosúladené**).
- **Ďalšie kódy:** `LAST50` (−50 %, e-mail 3 dni po registrácii bez nákupu), affiliate kódy (admin → Affiliate, vytvárajú sa vo Whope).
- **Reset po spálení:** 40 % z ceny balíčka (špeciálna ponuka v e-mailoch „Trasa B"). Starý účet dostane flag `reset_used`.
- **Aktivačný poplatok funded účtu:** ⚠️ podľa `AGENTS.md` $80 jednorazovo (plán `WHOP_PLAN_ACTIVATION`). Pred tým, než sa to bude komunikovať,
  overiť v `_shared/packages.ts` a vo Whope.
- **Kapacita spustenia:** voliteľný limit prvých N kupujúcich (`LAUNCH_CAPACITY`, `LAUNCH_SINCE`), endpoint `checkout-availability`;
  nad limit sa ide na waitlist (`waitlist-join`, admin → Waitlist pozýva ďalších).
- **Testovací balíček:** `package_key = "test"` ($1 000 kapitál) — pre interné testovanie platby, vyňatý z automatického zatvárania.

## 3. Odvodené parametre (z kapitálu `cap`)

Počíta `packageMeta()` v `js/packages.js` (a zrkadlo v `_shared/packages.ts`).

| Parameter | Vzorec | Starter | Advanced | Elite |
|---|---|---:|---:|---:|
| Cieľ fázy 1 | +10 % | $200 | $2 500 | $10 000 |
| Cieľ fázy 2 | +5 % | $100 | $1 250 | $5 000 |
| Max. celková strata | −10 % | $200 (floor $1 800) | $2 500 | $10 000 |
| Max. denná strata | −4 % | $80 | $1 000 | $4 000 |
| Max. stávka na tiket | 1,5 % | $30 | $375 | $1 500 |
| Rozdelenie zisku | 80 % hráč | | | |
| Kvalifikačný tiket | výherný tiket s čistým ziskom ≥ 0,5 % kapitálu | $10 | $125 | $500 |

## 4. Fázy a podmienky

| | Fáza 1 – Challenge | Fáza 2 – Verification | Fáza 3 – Partner (funded) |
|---|---|---|---|
| Cieľ | +10 % | +5 % | — |
| Časový limit | 30 dní | 30 dní | žiadny |
| Max. celková strata | −10 %, **statická** (floor = kapitál −10 %) | rovnako | −10 %, **trailing** od najvyššieho zostatku (hwm) |
| Max. denná strata | −4 % kapitálu, reset o polnoci UTC | rovnako | rovnako |
| Prechod ďalej | po splnení cieľa čaká na **schválenie adminom** (+ KYC pre funded) | rovnako | — |

### Časový limit fázy (30 dní)
- Lehota = 30 dní od `phase_started_at` + `phase_bonus_days` (bonus pridáva admin, napr. kompenzácia výpadku; bonus patrí len aktuálnej fáze, pri schválení ďalšej sa nuluje).
- **Vynucuje sa denne** (`account-maintenance`, 05:00 UTC) cez secret `PHASE_EXPIRY_ENFORCE=true`. Účet sa zatvorí s dôvodom
  „Phase N time limit exceeded (X days)" a hráč dostane e-mail.
- **3 dni pred koncom** príde upozornenie (jednorazovo na daný termín, stĺpec `phase_expiry_warned_for`).
- **Ochrana:** kto cieľ fázy *preukázateľne* splnil (počítané z tiketov, nie z uloženého zostatku), sa pre čas nezatvára.
- **Výnimky:** e-maily `@fundly.games`, balíček `test`, a e-maily v `PHASE_EXPIRY_EXCLUDE`.

### Neaktivita (len funded účty)
Aspoň 1 tiket za 14 dní. Deň 7 a 13 upozornenie, deň 14 účet zhorí (`account-maintenance`).

### Tikety
- Max. stávka 1,5 % kapitálu, kurz každého výberu **1,00 – 8,00**, **jedna stávka na zápas**.
- **Konzistencia:** potenciálny zisk jedného tiketu ≤ 40 % cieľa fázy (u funded 40 % z 5 % kapitálu) — bráni „jednému veľkému hodu".
- **Cash-out:** vždy 90 % vkladu a len pred štartom zápasu (server nastaví výplatu sám, klientovi neverí).
- Kurzy a výsledky: bookmaker Bet365 (resp. Sportsbet.com.au) cez odds-api.io. Tikety sa po podaní nedajú meniť.
- Nevyriešené vklady sa v limite denných strát nepočítajú ako strata, kým tiket nedobehne.

## 5. Výplaty (contractor payouts)

Podmienky podľa `rules.html` §5 a `request-payout`:
- **+5 % profit buffer** nad kapitálom (raz, na začiatku funded fázy) pred prvou žiadosťou,
- **min. 5 kvalifikačných** výherných tiketov (každý ≥ +0,5 % kapitálu),
- **max. $4 000 na žiadosť**, hráč dostane **80 %**, medzi výplatami odstup **14 dní**,
- **KYC cez Whop** pred prvou výplatou, schválená výplata sa vyrovná do 7 dní,
- **Server-side strop** (`_shared/payout-cap.ts`): `0,8 × max(0, zisk preukázaný tiketmi) − už vyplatené`; žiadosť nad strop sa zamietne.
- Výplata ide cez `whop-payout` (admin ju schvaľuje v `admin.html`).

## 6. Zakázané stratégie

Arbitráž / zneužitie nesprávnych kurzov, **využívanie oneskorených dát (latency / courtsiding)**, multi-účty a kolúzia (zdieľané zariadenie, IP, platobná metóda),
zneužitie technických chýb. Porušenie = ukončenie účtu bez výplaty. Detekcia: `04-security-and-risk.md`.

## 7. Životný cyklus účtu (`challenge_accounts.state`)

```
          nákup (whop-webhook)
                 │
              active ──── cieľ splnený (klient žiada) ──▶ pending_approval ──admin schváli──▶ active (fáza 2) / funded (fáza 3)
                 │                                              │ └─admin zamietne──▶ active
                 ├── limit straty / čas / neaktivita ───────────┴──────────────▶ breached  (terminálny stav)
```

- **Klient smie len „zhoršiť"** účet (→ `breached`) alebo požiadať o schválenie. Na `funded` a do vyššej fázy ho posúva **výhradne** `approve-phase` (admin + KYC).
- `breached` je terminálny: nový pokus = nový nákup (so zľavou 40 % na reset).
- `cancelled` nastáva pri zrušení členstva vo Whope (webhooky `membership.*`).
