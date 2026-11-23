# Tipsport.cz vs Fundly: čo ľuďom u nás chýba (23. 11. 2026)

Prešli sme Tipsport.cz: zoznam futbalu, detail zápasu Bodø/Glimt – LASK, Bojové sporty, UFC 5. 12., Oktagon 99, live a tiket. Dizajn ostáva náš. Ide o funkcie a možnosti stávok, na ktoré sú ľudia zvyknutí.

## Čo Tipsport má a my nie

### Zoznam zápasov

1. **Prepínač trhov nad zoznamom**: Zápas · Postup · Hráči · 1. poločas · Sázka bez remízy · Handicap · Počet gólů · Tým dá gól · Každý tým dá · Výsledek a góly · Rohy · Žluté karty. Prepínač mení stĺpce kurzov priamo v zozname.
2. **Stĺpce 1 · 10 · 0 · 02 · 2**: dvojitá šanca je v zozname hneď vedľa 1X2.
3. **„+51“ pri zápase**: počet ďalších trhov, láka otvoriť detail.
4. **Ikony pri zápase**: štatistiky (📊), analýzy (A), TV/stream.
5. **Ľavý panel**: Dnes/Zítra, Oblíbené sporty s pripináčikom a súťaže pod športom. Súťaže majú české názvy, napríklad „Česká Chance Liga“ či „1. anglická liga“, a česká liga je hore.
6. **Dlhodobé stávky**, napríklad víťaz Ligy majstrov.

### Detail zápasu

1. **Hlavička**: súťaž, čas, **TV stanica** (napr. Nova Sport 4) a „Přidat do Mého výběru“.
2. **Záložky**: Nejsázenější · Sestavy · Statistiky · Analýzy · Tikety.
3. **„Hlavní příležitosti“, čiže ako tipujú ostatní**:
   - stĺpcový graf, koľko percent stávok ide na 1/0/2;
   - suma „Vsazeno“, napríklad 628 tis. Kč;
   - „V aréně Nx“.
4. **„Další nejsázenější příležitosti“**: top 3 najtipovanejšie trhy.
5. **Pohyb kurzu priamo pri kurze**: 1.75 ↘ 1.53, šípka hore alebo dole.
6. **Filtre trhov**: Vše · Góly · Poločasy · Rohy, plus **BetBuilder** (kombinácia viacerých tipov z jedného zápasu).
7. **Názvy trhov ako veta**, napríklad „Vyhraje zápas nebo povede o 2 góly“, „Každý tým dá v zápasu“, „Kdo dá v zápasu 1. gól“, „Výsledek zápasu a góly týmů“.
8. **Fórum pri zápase**, teda komentáre ľudí.

### Live

1. **Hraje se / Následuje**, ikony športov s počtom live zápasov a filtre Stream a Tracker.
2. **Skóre a minúta** pri zápase, napríklad „1:0 1. pol. 31. min“.
3. **Výber trhu pre stĺpce** (Zápas / Počet gólů / Kdo dá), live má desiatky trhov.

### Tiket

1. **Viac tiketov naraz** (1 · 2 · 3) a **rýchle vklady** 20 / 100 / 500.
2. **Možná výhra** veľkým písmom.
3. **Zaradiť do súťaže.**

### Komunita

**„Inspirujte se“**: tikety a zisky iných hráčov, ankety a články.

## MMA na Tipsporte (dôležité pre klientov)

- **UFC 5. 12.**: celá karta, ale **iba víťaz zápasu**: 1 / remíza (45.00) / 2 a „+1“. Kolo ani spôsob ukončenia zatiaľ **nemá ani Tipsport**. Tieto trhy pridávajú bookmakeri až tesne pred turnajom.
- **Oktagon 99**: celá karta (Holeček, Peňáz, Cigánik…), tiež iba víťaz.
- Tipsport má MMA pod „Bojové sporty“ (UFC, Oktagon, KSW, Clash). **Odds-api tieto Tipsport MMA zápasy vôbec nesťahuje**, preto sme cez Tipsport mali 0. Fortuna ich v odds-api má.

## Čo už máme rovnako alebo lepšie

- Zoznam s 1X2, sledované zápasy (★), filtre Dnes/LIVE/Vysoké kurzy, ligové čipy a česká liga hore.
- Vývoj kurzu v detaile (graf za 48 h), AKO tikety, cashout a predvoľby vkladu (v %).
- Nevyhodnotiteľné trhy schovávame (GRADEABLE_MARKETS). Tipsport ich má stovky, my len tie, ktoré vieme férovo vyhodnotiť.

## Odporúčanie: čo spraviť (podľa prínosu a náročnosti)

### Ihneď, dáta máme

1. **„Ako tipujú ostatní“ na Fundly**: % tipov na 1/0/2 a počet tipov pri zápase, počítané z našich tiketov (anonymne a súhrnne). Presne to chcú klienti.
2. **Pohyb kurzu ↗↘ pri kurze** v zozname aj detaile. Históriu kurzov už máme.
3. **Dvojitá šanca (10 / 02) v zozname** a **„+N trhov“** pri zápase.
4. **Prepínač trhov nad zoznamom**: Zápas · Počet gólů · Oba dají gól · Handicap · 1. poločas.
5. **Filtre trhov v detaile** (Vše · Góly · Poločasy · Rohy) a **české vetné názvy trhov**.
6. **Hokej: trh „výsledok v riadnom čase“** (3-Way Result), aby sa vrátil český hokej z Fortuny. Výsledky po tretinách máme.

### Stredná náročnosť

7. **Hlavička zápasu**: TV stanica a aréna. Pri MMA a veľkých zápasoch ich doplníme ručne v admine, odds-api ich nemá.
8. **Live: Hraje se / Následuje**, počty live zápasov pri športe a minúta so skóre.
9. **Rýchle vklady v pevných sumách** popri percentách a viac rozpracovaných tiketov naraz.
10. **„Inspiruj sa“**: najlepší Fundly hráči a ich verejné tikety (dobrovoľne, so súhlasom).

### Až s ďalšími bookmakermi alebo dátami

- Viac trhov pre české ligy (dnes iba 1X2 a dvojitá šanca od Fortuny), rohy, karty a hráčske tipy.
- Live kurzy (odds-api ich pri našich bookmakeroch takmer nemá).
- Sestavy a štatistiky zápasu (potrebný iný zdroj dát).
- Remíza v MMA (Tipsport ju ponúka za 45.00, vyžaduje úpravu vyhodnotenia).
