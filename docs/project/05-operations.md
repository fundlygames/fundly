# 05 — Prevádzka a postupy

## 1. Workflow zmien

1. `git checkout -b nazov-vetvy` z `main` (nikdy priamo do `main`).
2. Zmena + commit (správa vysvetľuje *prečo*; AI agenti pridávajú trailer `Co-Authored-By: …`).
3. `git push -u origin nazov-vetvy` a otvoriť PR proti `main`. **PR zlučuje majiteľ** (`@fundlygames`, `CODEOWNERS`), nie autor.
4. Po zlúčení sa frontend sám nasadí (GitHub Pages, ~1 min).
5. **Backend (Edge Functions) sa nasadzuje ručne** a až po schválení majiteľa (viď 3).
6. Pri každej zmene `js/*` alebo `css/*` zvýšiť `?v=` na **všetkých** HTML (`grep -rl "STARÁVERZIA" . --include='*.html' | xargs sed -i '' 's/STARÁ/NOVÁ/g'`).

Lokálny náhľad frontendu: `python3 -m http.server 8791` a otvoriť `http://localhost:8791/index.html` (backend ide proti produkčnému Supabase).

## 2. Prístupy a nástroje

| Čo | Ako |
|---|---|
| Supabase CLI | `supabase` (binárka z GitHub releases). Prihlásenie cez `SUPABASE_ACCESS_TOKEN` (osobný token z dashboardu, **po práci zrušiť/otočiť**) |
| SQL na produkcii | Supabase SQL editor, alebo Management API `POST /v1/projects/{ref}/database/query` s tým istým tokenom |
| Logy funkcií | Supabase dashboard → Edge Functions → Logs; výsledky cronu: `select * from net._http_response order by created desc` |
| Admin UI | `admin.html` — odomknutie admin kľúčom alebo prihlásením admin používateľa (`admin_users`) |
| Whop | Whop dashboard (platby, plány, promo kódy, KYC, transfery), webhook ukazuje na `…/functions/v1/whop-webhook` |
| E-maily | Resend dashboard (doména `fundly.games`) |
| Reklama | Meta Ads Manager + Events Manager (Test events pre `Purchase`) |

⚠️ Admin kľúč, Whop/Resend/Meta kľúče a Supabase service role **nikdy** do chatu, commitov ani screenshotov. Z AI session sa nikdy neprihlasuje za používateľa.

## 3. Nasadenie backendu

```bash
export SUPABASE_ACCESS_TOKEN=…   # platný osobný token
supabase functions deploy <nazov> --project-ref siruaytogfsgujpwzcsb --no-verify-jwt
supabase secrets set NAZOV=hodnota --project-ref siruaytogfsgujpwzcsb
supabase secrets unset NAZOV --project-ref siruaytogfsgujpwzcsb
```

- Zmena súboru v `_shared/` sa prejaví až **po opätovnom deployi každej funkcie, ktorá ho importuje**.
- Migrácie (`supabase/migrations/NNN_*.sql`) sa aplikujú ručne; číslovanie je súvislé.
- **Bezpečný postup pre rizikové zmeny:** nasadiť kópiu pod iným názvom (`tmp-<funkcia>`), otestovať na jednorazových účtoch (`@example.com`), kópiu zmazať
  (`supabase functions delete tmp-…`) a až potom nasadiť skutočnú funkciu.

## 4. Vypínače a režimy

| Vypínač | Predvolené | Efekt |
|---|---|---|
| `TICKET_ADMISSION_ENFORCE=false` | zapnuté | Neplatné tikety sa len zalogujú („would void"), nestornujú |
| `LOSS_LIMIT_ENFORCE=false` | zapnuté | Limity straty sa len zalogujú („would close"), účty sa nezatvárajú |
| `PHASE_EXPIRY_ENFORCE` | `true` | Bez `true` beží časový limit len ako suchý beh (`dry_run`) |
| `PHASE_EXPIRY_EXCLUDE` | (zoznam e-mailov oddelený čiarkou) | E-maily vyňaté z automatického zatvárania |
| `account-maintenance` body `{"dry_run":true}` | — | Vypíše, koho by zatvoril, nič nemení |

Po odblokovaní podozrivého správania sa vždy najprv skontroluje `tickets.admission_note` (hodnoty `voided:`/`would void:`) a logy.

## 5. Spustenie cronu ručne (bez toho, aby admin kľúč prešiel cez človeka/AI)

Cron príkaz je uložený v `cron.job`; dá sa vykonať priamo v databáze:

```sql
do $$ declare c text;
begin
  select command into c from cron.job where jobname = 'account-maintenance-daily';
  c := replace(c, $q$body := '{}'::jsonb$q$, $q$body := '{"dry_run":true}'::jsonb$q$);
  execute c;
end $$;
-- výsledok o ~20 s:
select status_code, content::text from net._http_response order by created desc limit 1;
```

## 6. Receptúry (SQL)

> Spúšťať opatrne a vždy najprv `select` na overenie cieľa.

**Pridať bonusové dni k fáze (kompenzácia výpadku):**
```sql
update challenge_accounts set phase_bonus_days = phase_bonus_days + 7
where state in ('active','pending_approval') and phase in (1,2);
```
(+ informačný e-mail hráčom. Nikdy neposúvať `phase_started_at` — pokazilo by to vyhodnotenie kvalifikačných tiketov.)

**Zablokovať postup hráča:** `update challenge_accounts set admin_note = 'NOT APPROVED – dôvod' where email = '…';` a v `admin.html` postup nezosúhlasiť.

**Zmazať testovací účet:** najprv `select` účtu a viazaných záznamov (`payments` sa **nemazať** — účtovný záznam), potom
`delete from tickets / balance_sync_audit where account_id = …; delete from challenge_accounts where id = …; delete from auth.users where id = …;`

**Prehľad hráčov:** `select email, package_key, phase, state, tickets_total, last_ticket_at, watch_status, risk_score from challenge_accounts order by created_at;`

## 7. Testovanie

- **Demo účet:** `demo-test@fundly.games` (Advanced $25 000, vyňatý z automatického zatvárania, mimo rebríčka). Heslo je mimo repa (držiteľ projektu).
  Starý `demo@fundly.games` je legacy, heslo nie je známe.
- **Platba:** balíček `test` ($1 000) a Whop test/real; po nákupe skontrolovať e-mail „Payment confirmed", vznik riadku v `challenge_accounts` a `Purchase` v Meta Test events.
- **Integračné testy** (Python proti reálnym funkciám, jednorazové účty `@example.com`, vždy s upratovaním): vytvorenie používateľa cez `/auth/v1/signup`, SQL vloženie `challenge_accounts`/`tickets`,
  volanie funkcií s JWT, kontrola stavu v DB a zmazanie. Pokryté scenáre: admission (skončený zápas, nafúknutý live kurz, vklad/kurz mimo limit, duplicita zápasu, nemennosť, cash-out, čas štartu),
  stavový automat, limity straty (8 scenárov), overenie e-mailu (9 scenárov), e-mailové throttle, strop výplaty.
- **Overenie syntaxe TypeScriptu bez Deno:** transpilácia v prehliadači (TypeScript z CDN) alebo samotný `supabase functions deploy` (zlyhá pri chybe).
- **Frontend:** `preview_start`/prehliadač → konzola, sieť (`whop-checkout`, `sync-*`), responzívne zobrazenie (mobil 375 px), i18n (`?lang=`).

## 8. Denný / týždenný kontrolný zoznam

1. Admin → **Financie**: tržby, platby, výdavky na reklamu (`ad_spend`).
2. Admin → **Problémy**: nové `watch`/`hold`; `tickets.admission_note` — stornované tikety (oprávnene?).
3. Admin → **Hráči**: čakajúce schválenie fázy (`pending_approval`) a žiadosti o výplatu (`payouts`).
4. `cron.job_run_details` + `net._http_response`: sú všetky joby `succeeded`? (občasné `timeout 5000 ms` je len čakanie klienta, funkcia dobehne.)
5. Resend: doručiteľnosť, odmietnuté e-maily. Support (`support_tickets`) a odpovede.
6. Reklama: výdavok vs. predaje (UTM → `payments`).

## 9. Riešenie problémov (z praxe)

| Príznak | Príčina / riešenie |
|---|---|
| Hráč „nemôže kúpiť" (`unauthorized`) | Vypršal/zmenený **Whop API kľúč** (`WHOP_API_KEY`) — vytvoriť nový a `secrets set` |
| Platobná brána čierna / pomalá | Whop embed sa načítava 2–5 s; spinner sa drží, kým Whop nepošle „ready"; skontrolovať `payTakingLong` hlásenie |
| Žiadne snapshoty kurzov | `odds-snapshot` parsuje kurzy z reťazcov (opravené 14. 10.); prázdne behy sú v poriadku, ak nie sú otvorené tikety |
| Hráč dostane „Odds changed" | Čerstvé kurzy sa líšia od lístka — potvrdiť znova |
| Supabase e-maily neprichádzajú | Vstavaný mailer má limit 2/hod a nie je nastavené SMTP — všetko ide cez Resend vlastnými funkciami |
| Nový JS sa neprejavil | Zabudnuté zvýšenie `?v=` na niektorom HTML |
| Výpadok odds-api (nezaplatené členstvo) | Hráči nemôžu tipovať → kompenzácia bonusovými dňami + e-mail; kontrola kľúča `curl …/v3/bookmakers` |
| cron `email-recovery-15min` občas 500 „Run failed" | Dočasná chyba DB; ďalšie behy prejdú (⚠️ chybu skrýva generická správa v `catch`) |
