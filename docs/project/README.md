# Fundly — projektová dokumentácia

> Stav overený naposledy **15. 10. 2026** (posledná kontrola produkcie). Čo je neisté alebo sa mohlo zmeniť, je označené ⚠️.
> Dokumentácia je v slovenčine, názvy súborov, tabuliek, funkcií a premenných sú anglicky tak, ako sú v kóde.

## Čo je Fundly

Fundly je **prop-firm štýl simulácie športového tipovania**. Hráč si kúpi „Challenge" (balíček s virtuálnym kapitálom), na
reálnych kurzoch bookmakera tipuje so simulovanými peniazmi a plní pravidlá:

1. **Fáza 1 – Challenge:** dosiahnuť +10 % kapitálu do 30 dní.
2. **Fáza 2 – Verification:** dosiahnuť ďalších +5 % do 30 dní.
3. **Fáza 3 – Fundly Partner (funded):** hráč tipuje ďalej a dostáva **80 % zisku** ako „contractor payout" (výplata cez Whop po KYC).

Hráč nikdy nevsádza skutočné peniaze. Platí len jednorazový poplatok za balíček (a prípadný reset). Právne je to postavené ako
*simulačný program a B2B zmluva s dodávateľom analytických služieb*, nie ako hazard (viď `terms.html`, `rules.html`).

- **Web:** <https://fundly.games> (GitHub Pages, repo `fundlygames/fundly`)
- **Platby:** Whop (embedded checkout) · **Backend:** Supabase (Postgres + Edge Functions + Auth) · **E-maily:** Resend
- **Kurzy a výsledky:** odds-api.io (Bet365, Sportsbet.com.au) · **Reklama:** Meta (pixel + Conversions API) · **UX analytika:** Microsoft Clarity

## Obsah

| Súbor | O čom je |
|---|---|
| [01-business-and-rules.md](01-business-and-rules.md) | Produkt, balíčky, ceny, pravidlá hry, výplaty, zakázané stratégie |
| [02-architecture.md](02-architecture.md) | Architektúra, tok dát, frontend (stránky, JS moduly), lokálny stav hráča |
| [03-backend.md](03-backend.md) | Databáza, Edge Functions, cron joby, migrácie, tajomstvá (secrets) |
| [04-security-and-risk.md](04-security-and-risk.md) | Ochrana pred podvodmi: kontrola tiketov, stavový automat, limity, riziko-skóre, overenie e-mailu |
| [05-operations.md](05-operations.md) | Prevádzka: deploy, workflow, vypínače, administrácia, receptúry, testovanie |
| [06-status-and-roadmap.md](06-status-and-roadmap.md) | Aktuálny stav, otvorené rozhodnutia, známe problémy, história zmien |

## Rýchla orientácia v repozitári

```
index.html, get-started.html, checkout.html   verejný funnel (landing → výber balíčka → platba)
dashboard.html + js/dashboard.js + js/portfolio.js   hráčsky dashboard (jadro simulácie)
admin.html + js/admin.js                      administrácia (reporty, hráči, riziká, support…)
rules.html, terms.html, privacy.html, …       právne stránky
js/packages.js                                JEDEN zdroj pravdy pre balíčky a odvodené pravidlá
js/config.js                                  Supabase URL + anon kľúč (verejné)
supabase/functions/*                          Edge Functions (Deno/TypeScript)
supabase/functions/_shared/*                  zdieľaná logika (pravidlá, kontrola tiketov, e-maily…)
supabase/migrations/001…032                   schéma databázy
docs/WHOP-SETUP.md                            ⚠️ pôvodný návod na nasadenie (ceny v ňom sú zastarané, viď 06)
AGENTS.md, CONTRIBUTING.md                    pokyny pre agentov / prispievateľov
```

## Najdôležitejšie zásady (ak čítaš len jednu stránku)

- **Server je autorita, klient sa nedá veriť.** Hráč môže mať upravený prehliadač. Stav účtu, tikety, výplaty aj limity sa overujú
  na serveri (viď `04-security-and-risk.md`).
- **Žiadne push do `main`.** Zmeny idú cez vetvu a PR, ktorý zlúči majiteľ. `main` sa nasadzuje na produkciu automaticky.
- **Každé nasadenie JS/CSS = nová verzia `?v=` na všetkých HTML** (cache-bust), inak hráči uvidia starý kód.
- **Edge Functions sa nasadzujú ručne** (`supabase functions deploy … --no-verify-jwt`) až po schválení majiteľa.
- **Tajomstvá nikdy do repozitára ani do chatu.** V dokumentácii sú len názvy premenných.
