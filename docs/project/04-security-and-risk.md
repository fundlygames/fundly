# 04 — Bezpečnosť, ochrana pred podvodmi a riziko

**Predpoklad:** hráč môže používať upravený prehliadač. Všetko, čo rozhoduje o peniazoch (výplata), o postupe alebo o zatvorení účtu, musí overiť server.
Pôvodne bola väčšina logiky v klientovi (`portfolio.js`); od 22. 9. 2026 sa pravidlá postupne presúvajú na server (každý bod nižšie je nasadený a otestovaný).

## 1. Kontrola tiketu pri podaní (ticket admission)

`sync-tickets` + `_shared/ticket-admission.ts`. Platí od 14. 10. 2026 (`TICKET_ADMISSION_ENFORCE`, predvolene zapnuté).
Tiket, ktorý neprejde, sa **stornuje** (stav `push`, vklad sa vráti, `admission_note = "voided: …"`) a hráč dostane dôvod.

**Statické kontroly (bez volania API):** vklad ≤ 1,5 % kapitálu · kurz každého výberu v 1,00–8,00 · potenciálny zisk ≤ 40 % cieľa fázy · max. jedna stávka na zápas.

**Živé kontroly (voči odds-api.io, `fetchEventInfo`/`evaluateSelection`):**
- zápas už **skončil** alebo je nedostupný,
- zápas „pending", ale už mal začať (zastaraný stav),
- live trh bol stiahnutý (bookmaker ho už nenesie),
- live kurz je viac ako **+8 % + 0,02** nad trhom; pre-match viac ako +40 % + 0,1 (len proti vymysleným kurzom).

**Bezpečný pád:** ak API nie je dostupné alebo zápas už neexistuje (odds-api ich po ~24–48 h maže), tiket sa **nestornuje** (fail-open).

**Ďalšie opatrenia v tej istej ceste:**
- po prvom prijatí je tiket **nemenný** (výbery, vklad, kurz, čas sa berú z databázy, nie od klienta),
- časy štartu berie server z odds-api, `placed_at` sa normalizuje na serverový čas (klientov čas platí len v okne −120 s … +5 s),
- **cash-out** vždy 90 % uloženého vkladu a len pred uloženým štartom,
- tiket odoslaný klientom ako „vyhodnotený" sa nikdy neprijme naslepo: server si výsledok overí z odds-api (`settle-verify.ts`) alebo ho nechá pending.

**Klientska vrstva:** pred potvrdením tiketu `refreshSlipFromApi` načíta čerstvé kurzy/stav a zrkadlí tie isté pravidlá (príjemnejšie UX, nie bezpečnosť).

## 2. Stavový automat účtu a zostatok (`sync-account`)

- Klient smie účet len „zhoršiť" (`breached`) alebo požiadať o schválenie (`pending_approval`, len pre očakávanú ďalšiu fázu). Pokus o `funded`
  alebo iný postup sa **ignoruje** (log `STATE_TAMPER` / `PENDING_TAMPER`). Fázu mení iba `approve-phase`.
- **Zostatok** zo synchronizácie sa neprijme, ak presahuje to, čo vyplýva z tabuľky `tickets` (kapitál − vklady + výplaty vyriešených tiketov); odmietnutie sa zapíše do `balance_sync_audit`.
- `phase_started_at` nastavuje nákup/`approve-phase`; klient ho môže dodať len ak je stĺpec prázdny (inak by si 30-dňovú lehotu vynuloval posunom dátumu).
- Existujúci dôvod uzavretia sa neprepisuje.

## 3. Limity straty na serveri (`loss-limits.ts`, `loss-enforce.ts`)

Od 15. 10. 2026. Server počíta zo zapísaných tiketov (vklady nevyriešených tiketov sa **nepočítajú** ako strata):
- **celková strata:** zostatok fázy ≤ kapitál −10 % → `Max. loss exceeded (static -10 %)`,
- **denná strata** (UTC deň): strata > 4 % kapitálu (+ $0,50 tolerancia) → `Max. daily loss exceeded (-4 %)`.

Spúšťa sa po `sync-tickets`, `sync-account`, po prehranom tikete v `settle-tickets` a denne v `account-maintenance` (aj pre hráča, ktorý nesynchronizuje).
Hráč dostane e-mail „account closed". **Vyňaté:** `@fundly.games`, balíček `test`. Vypínač: `LOSS_LIMIT_ENFORCE=false`.
**Zatiaľ nepokryté:** funded účty (trailing limit od `hwm` a výbery sa z tiketov nedajú spoľahlivo odvodiť) — stále len klient.

## 4. Výplaty
`payout-cap.ts`: výplata ≤ `0,8 × max(0, zisk preukázaný tiketmi) − už vyplatené`. Žiadosť nad strop sa zamietne. KYC cez Whop, odstup 14 dní, max. $4 000. Výplatu schvaľuje admin a posiela `whop-payout`.

## 5. Časové limity a neaktivita
30 dní na fázu (+ bonusové dni), 3-dňové varovanie, neaktivita 14 dní na funded účte — viď `01`. Vynucuje `account-maintenance`; kto cieľ preukázateľne splnil, sa pre čas nezatvára.

## 6. Overenie vlastníctva e-mailu (anti pre-hijack)

**Problém:** účet vzniká bez potvrdenia e-mailu (autoconfirm, checkout bez hesla, Preview, verejné Supabase API). Kto vopred založil účet s cudzou adresou
a vlastným heslom, získal by neskôr zaplatený Challenge, ktorý webhook pripína k existujúcemu používateľovi podľa e-mailu.

**Riešenie (`_shared/mailbox.ts`, migrácia 032, nasadené 15. 10. 2026):**
1. Účet je **overený** (`app_metadata.mailbox_proven`), keď sa raz prihlásil odkazom/kódom z e-mailu (JWT `amr`: `otp`/`magiclink`/`recovery`). Zapisuje `restore-account` a `sync-account`.
2. Pri **nákupe** `whop-webhook` pre existujúci, **neoverený** účet, ktorý nevznikol pred < 20 min (čerstvá registrácia toho istého kupujúceho), **zmení heslo a zruší všetky relácie**
   (`kick_user_sessions`). Dnu sa dostane len majiteľ schránky cez magic link z e-mailu „Payment confirmed".
3. Čerstvý kupujúci má jednokrokový tok ako predtým. Ak sa po zaplatení nedokáže prihlásiť, dashboard mu povie, nech otvorí odkaz v e-maile.

Zvyškové riziko: útočník, ktorý sa zaregistruje v rovnakom 20-minútovom okne ako obeť pri jej nákupe (obeť by vtedy nedostala session a skončila by na oznamení „skontroluj e-mail").

## 7. Ochrana verejných endpointov
- **RLS:** tabuľky bez politík pre `anon`/`authenticated`; migrácia 030 zrušila verejné INSERT politiky (discount/waitlist) a zamkla `monthly_reports`/`odds_snapshots`.
- **E-mailové throttle** (`email_throttle`, `throttle.ts`): `discount-signup` 24 h, `request-password-reset` 60 s, `checkout-welcome-email` (len po reálnej registrácii) 24 h,
  Preview kolízia 120 s — aby sa nedali cudzie schránky zaplaviť a nepoškodila sa reputácia odosielacej domény.
- **Podpisy/kľúče:** Whop webhook (HMAC), cron (`x-cron-secret`/admin kľúč), admin (`ADMIN_API_KEY` alebo admin JWT), odhlásenie z e-mailov (HMAC token).
- **Súhlasy** (podmienky, pravidlá, cooling-off) sa ukladajú s časom do metadát používateľa.

## 8. Riziko-skóre a detekcia zneužitia (`risk.ts`, admin → Problémy)

Skóre = klientske signály + serverové signály. **`watch_status`:** `clear` (< 30), `watch` (≥ 30), `hold` (≥ 100) — `hold` sa v administrácii zobrazí ako „AUTO-HOLD". Skóre **nič automaticky nezastavuje** — slúži ako podklad pre rozhodnutie admina pri schvaľovaní postupu a výplaty.

| Signál | Význam |
|---|---|
| `SHARED_DEVICE_IP`, `SHARED_PAYMENT_METHOD` | Rovnaká IP / platobná metóda ako iný účet (multi-účty) |
| `MULTI_ACCOUNT_COLLUSION` | Opačná stávka na ten istý zápas z iného účtu |
| `FAST_TRACK` | Fáza 1 splnená nezvyčajne rýchlo |
| `LOW_LIQUIDITY_CONCENTRATION` | Väčšina objemu na jednej lige/trhu |
| `BOT_PATTERN` | 5+ tiketov do 10 minút |
| `TIMING_ANOMALY` | Veľa tiketov tesne pred uzávierkou |
| `LOW_VARIANCE` | Podozrivo stabilná úspešnosť v oknách po 10 tiketoch |
| `FEED_LAG_PATTERN`, `HIGH_CLV` | Kurz sa po stávke systematicky zmení v hráčovu prospech (využívanie oneskoreného feedu / courtsiding); vyžaduje `odds_snapshots` (plnia sa od 14. 10. 2026) |
| Klientske | arbitráž / sure-bet a value-bet tikety (`dashboard.js`) |

Admin vidí riziká v sekcii **Problémy** a detail tiketov v **Hráči**; `admin_note` slúži na interné poznámky (napr. „NOT APPROVED").

## 9. Čo sa stalo a naučilo (výber)
- **22. 9.:** hráč mal uložený zostatok vyšší, než podporovali tikety → zavedená serverová kontrola zostatku.
- **Courtsiding:** účet, ktorý vyhrával tikety vyhodnotené do ~3 minút po podaní; po audite sa uzavreli diery (zastarané kurzy, skončené zápasy, nemenné tikety, cash-out).
- **Odds-snapshot** ukladal prázdne dáta (kurzy z API sú reťazce, parsovalo sa len `typeof number`) → opravené, dáta sa teraz plnia.

## 10. Známe medzery / ďalšie kroky
- Limity straty pre **funded** účty (trailing od `hwm`) nie sú vynucované serverom.
- Klientsky odds-api kľúč je verejný (limit požiadaviek, nie bezpečnostný problém dát).
- Pri `FEED_LAG_PATTERN` / `HIGH_CLV` treba po zozbieraní dát doladiť prahy.
- Zvážiť skutočné potvrdenie e-mailu (OTP) pred vznikom účtu, ak sa konverzia po otvorení predajov ukáže ako nezávislá od trenia.
