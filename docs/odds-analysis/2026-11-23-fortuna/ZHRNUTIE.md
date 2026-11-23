# iFortuna CZ vs Tipsport.cz v odds-api: porovnanie z 23. 11. 2026

V oboch meraniach je druhý bookmaker Bet365. Merané sú zápasy na 14 dní dopredu a live zápasy.

Pri Fortune minul skript rezervu limitu API. Stolný tenis, rugby, kriket a menšie športy preto nie sú úplné. Pre rozhodnutie nie sú dôležité.

## Zápasy, ktoré sa reálne zobrazia na webe

Zápas sa na webe zobrazí, iba ak má niektorý bookmaker trh **ML**.

| Šport | Bet365 + Tipsport | Bet365 + Fortuna |
|---|---:|---:|
| Futbal | 638 | **737** |
| **MMA** | 2 | **19** (UFC 5. 12. celá karta 12/12, Oktagon 99 7/14) |
| Tenis | 174 (live 4) | **202** (live 9) |
| Basketbal | 77 | **96** |
| Hádzaná | 29 | 36 |
| Šípky | 15 | 15 |
| **Hokej** | **102** | **66** |
| Česká hokejová extraliga / 1. liga | 7 / 6 | 6 / 1 |
| Esporty | 35 | 28 |
| Volejbal | 24 | 23 |

## Trhy Fortuny v odds-api (veľmi úzke)

- **Futbal:** iba 1X2 a dvojitá šanca. Tipsport mal aj góly, oba dajú gól a handicap.
  - Pri veľkých ligách to nevadí, lebo ich doplní Bet365 s 50+ trhmi.
  - Česká 1. liga ostane iba s 1X2 a dvojitou šancou. Bet365 ju nemá.
- **Hokej:** iba „3-Way Result“, teda výsledok v riadnom čase. Web zatiaľ vie vyhodnotiť iba ML.
  - Zápasy, ktoré má len Fortuna, sa preto na webe **nezobrazia**. Týka sa to väčšiny českého hokeja.
- **Tenis:** viac trhov než Tipsport: víťaz, víťaz 1. setu, presný výsledok a handicap.
- **MMA:** iba víťaz zápasu. Kolo ani spôsob ukončenia nemá žiadny bookmaker v odds-api.
- **Esporty a volejbal:** nič.

## Záver

Fortuna jasne vyhráva **MMA**, z 2 zápasov na 19, a mierne aj futbal, tenis a basketbal. Prehráva **český hokej** a trhy v českom futbale.

Ako hokej s Fortunou vyriešiť: naučiť web trh „3-Way Result“, čiže tip na výsledok v riadnom čase.

- Vyhodnotenie však potrebuje skóre po riadnom čase. Zdroj výsledkov ho musí dávať zvlášť od predĺženia.
- Najprv to treba overiť na reálnych zápasoch.
