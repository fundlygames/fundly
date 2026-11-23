# Tipsport.cz v odds-api: zhrnutie analýzy z 23. 11. 2026

Na účte odds-api boli zvolení bookmakeri **Bet365 a Tipsport.cz**. Analýza zahŕňa zápasy na 14 dní dopredu a aktuálne live zápasy. Detaily sú v `REPORT.md`, strojové dáta v `summary.json`. Spustil ju skript `tools/odds_coverage.py` a urobila 1 733 požiadaviek na API.

## Čo Tipsport cez odds-api dáva

| Šport | Zápasy s kurzami: Tipsport | Zápasy s kurzami: Bet365 | Trhov na zápas: Tipsport | Trhov na zápas: Bet365 |
|---|---:|---:|---:|---:|
| Futbal | 438 | 516 | 3,9 | 53,1 |
| Hokej | 93 | 58 | 5,2 | 5,7 |
| Tenis | 170 | 147 | 2,2 | 5,5 |
| Basketbal | 47 | 80 | 3,9 | 8,6 |
| Esporty | 18 | 28 | 1 | 8,9 |
| Volejbal | 16 | 23 | 2,8 | 4,4 |
| Hádzaná | 4 | 34 | 2,5 | 5,8 |
| **MMA** | **0** | **2** | 0 | 1 |
| Box, šípky, stolný tenis, NFL, rugby, kriket | 0 | 17 / 15 / 411 / 85 / 20 / 11 | – | – |

- **Trhy v odds-api sú pri Tipsporte veľmi úzke:**
  - futbal: iba ML (1X2), Totals, BTTS a Spread;
  - tenis: iba víťaz a hry;
  - esporty: iba víťaz.

  Na webe Tipsportu je trhov oveľa viac, odds-api ich ale nesťahuje.
- **MMA:** Tipsport nemá v odds-api ani jeden zápas. Bet365 má z celého UFC Fight Night 5. 12. iba 2 hlavné zápasy a iba trh víťaz.
  - Oktagon 99 má 14 zápasov a kurzy k nim nemá nikto. Rovnako Cage Warriors, RFA, EFC a ONE.
  - Kolo, spôsob ukončenia ani over/under kôl nemá žiadny zo zvolených bookmakerov.
- **Live:** prakticky nič. Live kurzy majú len 4 tenisové zápasy a 1 hádzaná, a to u oboch bookmakerov.
- **Marža na hlavnom trhu** je pri Tipsporte vyššia, teda kurzy sú horšie:
  - hokej: 7,7 % u Tipsportu oproti 6,6 % u Bet365;
  - tenis: 8,8 % oproti 7,3 %.
  - Výnimkou je futbal, kde je Tipsport lepší: 8,0 % oproti 9,1 %.
- **Kurzy sa objavujú až blízko zápasu.** Hokej, basketbal a volejbal majú kurzy prakticky len 3 dni dopredu. Futbal má viac.

## Čo by sme odchodom Tipsportu stratili

Ide o zápasy, ktoré má iba Tipsport a Bet365 nie:

- **futbal:** 122 zápasov, napríklad **česká 1. liga (8)**, 2. Bundesliga, belgická liga, Superliga SK, DFB Pokal;
- **hokej:** 44 zápasov, napríklad **česká 1. liga**, WHL, ICE Hockey League, Ligue Magnus;
- **tenis:** 27 zápasov, hlavne Challengery;
- **esporty:** 7 zápasov.

→ Fortuna musí pokryť hlavne **českú 1. ligu vo futbale a českú hokejovú extraligu aj 1. ligu**. Inak hráči prídu o Spartu, Slaviu a Třinec.

## Na čo sa pozrieť pri Fortune (iFortuna CZ)

1. MMA: má Oktagon 99 a celú kartu UFC 5. 12.? Má trhy na kolo a spôsob ukončenia?
2. Live kurzy, hlavne futbal, hokej a tenis.
3. Počet trhov na futbalový zápas: Tipsport má 3,9.
4. České súťaže: futbalová 1. liga a pohár, hokejová extraliga a 1. liga, basketbalová NBL.
5. Marža hlavného trhu.

## Ako prepnúť a otestovať

Výber na odds-api ide meniť len **raz za 12 hodín**. Keby Fortuna vyšla horšie, späť na Tipsport sa dá prepnúť najskôr o 12 h.

1. V odds-api zrušiť výber a zvoliť **Bet365 + iFortuna CZ**.
2. Hneď potom nastaviť secret `ODDS_API_BOOKMAKER=Bet365,iFortuna CZ`. Inak backend dostane 403 a web bude ukazovať staré kurzy z cache.
   - Frontend netreba meniť: `bookmakerOrder` vezme akéhokoľvek bookmakera, ktorého zdroj vráti.
3. Spustiť analýzu:
   `python3 -I tools/odds_coverage.py --label fortuna --bookmakers "Bet365,iFortuna CZ" --days 14`
4. Porovnať:
   `python3 -I tools/odds_coverage.py --compare docs/odds-analysis/2026-11-23-tipsport docs/odds-analysis/<datum>-fortuna`
