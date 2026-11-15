/* Fundly — Akademie: lekce s kvízy, odznaky a měsíční živá analýza zápasů.
   - Lekce jsou statické karty v dashboard.html (#view-akademie, data-lesson="…").
   - Kvíz: 5 otázek na lekci, okamžitá zpětná vazba s vysvětlením, splněno při ≥ 80 %.
   - Postup: přihlášený hráč → Supabase tabulka academy_progress (migrace 043, RLS jen vlastní
     řádky), jinak localStorage. Postup z doby bez přihlášení se po přihlášení přenese.
   - Odznaky: Začátek (1 lekce) / 4 lekce / Absolvent akademie (všechny lekce) — jen CSS.
   - Živá analýza: assets/academy/live.json ({ date, title_cs, title_en, url, replay_url }).
   Texty: FUNDLY_I18N.extend (jmenný prostor "acad"), en + cs (sk přebírá češtinu). */
(function () {
  "use strict";

  const LESSONS = ["capital-management", "odds", "value-vs-arbitrage", "qualifying-tips", "drawdown", "line-movement", "discipline-tilt", "evaluation-steps"];
  const PASS = 0.8;
  const LIVE_JOIN_BEFORE_MS = 60 * 60 * 1000; // "Připojit se" od hodiny před začátkem
  const LIVE_DEFAULT_MIN = 90; // délka vysílání, pokud live.json neuvádí duration_min
  const LS_KEY = "fundly:academy:v1";

  // ---------- texty ----------
  // quiz[lesson] = [{ q: otázka, a: [možnosti], c: index správné, e: vysvětlení }]
  const STR = {
    en: {
      hero_t: "Learn the rules of the game before you enter",
      hero_d: "Eight short lessons, each with a quiz — from capital management to the whole evaluation. Pass the quizzes to earn Academy badges.",
      pass_rule: "Pass mark: 80 % correct",
      progress: "{n} of {total} lessons completed",
      quiz_btn: "Quiz", quiz_retry: "Retake quiz", quiz_close: "Close", quiz_hide: "Hide quiz",
      quiz_title: "Quiz: {title}", quiz_meta: "{n} questions · pass at 80 %",
      correct: "Correct.", wrong: "Not quite.",
      result_pass: "Passed — {score} % ({ok} of {n}). Lesson completed ✓",
      result_fail: "{score} % ({ok} of {n}). You need 80 % to pass — read the lesson again and retake the quiz.",
      status_done: "Completed · best {score} %", status_tried: "Best {score} % · not passed yet", status_new: "5 questions",
      saved_local: "Progress is saved in this browser. Sign in to keep it across devices.",
      badges_t: "Academy badges",
      b_start: "Getting started", b_start_d: "Pass your first quiz",
      b_four: "4 lessons", b_four_d: "Pass 4 quizzes",
      b_all: "Academy graduate", b_all_d: "Pass all 8 quizzes",
      b_locked: "Locked", b_earned: "Earned",
      live_k: "Monthly live match analysis",
      live_next: "Next live analysis: {date}",
      live_now: "Live now: {date}",
      live_soon: "Starting soon: {date}",
      live_past: "Last live analysis: {date}",
      live_note: "We go through upcoming matches together and explain how we read them. Educational content, not tipping advice.",
      live_cal: "Add to calendar", live_join: "Join", live_replay: "Watch the replay",
      live_title_fallback: "Fundly live match analysis",
      lm_t: "Reading line movement",
      lm_p: "Odds move before a match. The movement shows where the market's money and information are heading — not who will win.",
      lm_1: "Shortening odds (e.g. 2.20 → 1.90) mean the market believes in the outcome more: the implied probability rose from 45.5 % to 52.6 %.",
      lm_2: "Big moves usually follow news — line-ups, injuries, rotation, weather. Find out why the odds moved before you react.",
      lm_3: "Odds that have already dropped offer a worse price. Jumping in late behind the market usually means less value.",
      lm_4: "Compare the odds you took with the closing line (the odds just before kick-off). Regularly beating the closing line is a good sign that your analysis is ahead of the market.",
      lm_warn: "Odds on Fundly come from the Betano feed. Exploiting stale data (latency) or tipping on matches that have already started or finished is forbidden.",
      dt_t: "Discipline & tilt",
      dt_p: "Tilt is when emotions — frustration after a loss or euphoria after a streak — override your plan. More accounts end because of tilt than because of bad analysis.",
      dt_1: "Have a fixed plan: entry size, max. number of tips per day and the sports you tip. Write it down in advance.",
      dt_2: "After two or three losses in a row, take a break. The −4 % daily loss limit is a safety net, not a target.",
      dt_3: "Don't raise entry sizes after a loss and don't treat a good streak as a reason to take more risk — swings are normal.",
      dt_4: "Keep a journal: why you made the tip, at what odds and what you learned. Judge the decision, not just the result.",
      dt_5: "You have 30 days per phase — there is no need to hit the target in a week.",
      ev_t: "How the evaluation works, step by step",
      ev_1: "You pick a package and get simulated capital in virtual credits — you never pay for a tip with your own money.",
      ev_2: "Phase 1 — Challenge: target +10 % of capital within 30 days and at least 5 qualifying tips (each with a net profit of at least +0.5 % of capital).",
      ev_3: "Limits apply the whole time: max. overall loss −10 % (static in Phases 1 and 2), max. daily loss −4 % (resets at midnight UTC), max. 1.5 % of capital per tip, odds 1.00–8.00 per selection, one open tip per match.",
      ev_4: "Consistency rule: the potential profit of a single tip may not exceed 40 % of the phase target (4 % of capital in Phase 1, 2 % in Phase 2).",
      ev_5: "Once you reach the target and the qualifying tips, the operator confirms the move to the next phase after a review.",
      ev_6: "Phase 2 — Verification: target +5 % within 30 days, same limits as Phase 1.",
      ev_7: "Phase 3 — Fundly Partner: no time limit, max. loss −10 % trailing from your highest balance, 80 % Performance Reward share. 14 days without a tip closes the account.",
      ev_8: "Rewards: one-time $80 activation, a profit buffer of at least +5 %, 5 qualifying tips before every request, $10–$4,000 per request, at least 14 days between rewards and identity verification (KYC). Requests are reviewed within 24 hours.",
      ev_9: "Breaking a loss limit or missing a phase target in time closes the account. A reset costs 40 % of the package price (once per closed account).",
      ev_rules: "Read the full Challenge Rules →",
      quiz: {
        "capital-management": [
          { q: "What is the maximum entry size for a single tip on Fundly?", a: ["0.5 % of capital", "1.5 % of capital", "5 % of capital", "There is no limit"], c: 1, e: "The max. risk per tip is 1.5 % of capital in every phase, and the platform enforces it automatically." },
          { q: "With $4,000 capital, what is the largest entry you can make on one tip?", a: ["$40", "$60", "$200", "$400"], c: 1, e: "1.5 % of $4,000 = $60." },
          { q: "You've lost three tips in a row. What does the lesson recommend?", a: ["Double the next entry to win it back fast", "Keep the same entry size and stick to your plan", "Switch to the highest odds available"], c: 1, e: "Chasing losses with bigger entries is the most common way accounts hit the loss floor. Flat entries keep swings under control." },
          { q: "Why are flat entry sizes (1–2 % of capital) recommended?", a: ["One bad run can't knock you out, and results depend on your analysis rather than one lucky tip", "Because they always hit the target", "Because bigger entries are never allowed"], c: 0, e: "Small, consistent entries survive normal variance, so your long-term results reflect the quality of your analysis." },
          { q: "How should you think about your challenge capital?", a: ["As a fixed budget you manage according to a plan", "As a number to double as quickly as possible", "As a bonus that doesn't really matter"], c: 0, e: "Treat capital as a fixed budget, not a number to double overnight." },
        ],
        odds: [
          { q: "What is the implied probability of odds of 2.50?", a: ["25 %", "40 %", "60 %", "250 %"], c: 1, e: "1 ÷ 2.50 = 0.40, i.e. 40 %." },
          { q: "A $20 entry at odds of 1.80 is successful. What is the total return?", a: ["$36", "$16", "$21.80", "$38"], c: 0, e: "Return = entry × odds = $20 × 1.80 = $36 (of which $16 is net profit)." },
          { q: "What is the net profit of a successful $10 entry at odds of 3.00?", a: ["$30", "$20", "$13"], c: 1, e: "The return is $30; minus the $10 entry, the net profit is $20." },
          { q: "Why do the implied probabilities of all outcomes add up to more than 100 %?", a: ["The bookmaker builds a margin into the odds", "Because one of the outcomes is certain", "It's a calculation error"], c: 0, e: "The margin is what pushes the total above 100 % — the odds are slightly lower than the 'fair' ones." },
          { q: "Which odds represent the lowest implied probability?", a: ["1.50", "2.00", "4.00"], c: 2, e: "The higher the odds, the lower the probability: 1 ÷ 4.00 = 25 %." },
        ],
        "value-vs-arbitrage": [
          { q: "What is a value tip?", a: ["A tip where the odds are higher than the true probability of the outcome suggests", "The tip with the lowest odds on offer", "Covering all outcomes across different bookmakers"], c: 0, e: "Value means the price is better than the real chance — you have an edge but still accept variance." },
          { q: "What is arbitrage (sure betting)?", a: ["Covering all outcomes across bookmakers to lock in a guaranteed profit", "Tipping on the favourite", "Combining several matches in one tip"], c: 0, e: "Arbitrage hedges every outcome so the result no longer matters." },
          { q: "Is arbitrage allowed on Fundly?", a: ["Yes, if the profit is small", "No — it is forbidden, gets flagged automatically and leads to the account being closed", "Only in Phase 3"], c: 1, e: "Arbitrage and sure-betting strategies are forbidden in every phase (Challenge Rules, section 6)." },
          { q: "You estimate a team's chance at 50 % and the odds are 2.30. What does that mean?", a: ["The odds imply about 43.5 %, so by your estimate the price has value — the outcome is still not certain", "The odds are too low, so there is no value", "The outcome is certain"], c: 0, e: "1 ÷ 2.30 ≈ 43.5 %. If your estimate is higher than the implied probability, the price has value in your view — but any single tip can still lose." },
          { q: "What do the rules say about value and mispriced odds?", a: ["Finding value through your own analysis is allowed; systematically exploiting obvious pricing errors or delayed odds is forbidden", "Any tip at higher-than-fair odds is forbidden", "The rules don't mention it"], c: 0, e: "Section 6 forbids arbitrage and the systematic exploitation of obvious pricing errors or stale/delayed odds. Value you find with your own analysis is the skill being evaluated. Tips flagged by automatic signals are only reviewed." },
        ],
        "qualifying-tips": [
          { q: "How many qualifying tips do you need to pass a phase?", a: ["3", "5", "7", "10"], c: 1, e: "Every phase requires at least 5 qualifying successful tips." },
          { q: "With $2,000 capital, what is the minimum net profit a tip needs to qualify?", a: ["$5", "$10", "$20", "$100"], c: 1, e: "0.5 % of $2,000 = $10." },
          { q: "A $10 entry at odds of 1.40 is successful on a $2,000 account. Does it qualify?", a: ["Yes", "No — the $4 net profit is below the $10 threshold"], c: 1, e: "$10 × 1.40 = $14, so the net profit is $4, which is less than 0.5 % of capital ($10)." },
          { q: "Does the qualifying-tip rule also apply to rewards?", a: ["No, only in Phase 1", "Yes — you need 5 new qualifying tips before every reward request", "Only before the first reward"], c: 1, e: "The counter resets after each reward, so you need 5 qualifying tips again before the next request." },
          { q: "Why does the rule exist?", a: ["To prove consistent, real tipping — not one lucky all-in", "To make the phase longer", "To limit how many tips you can make"], c: 0, e: "Several meaningful successful tips show skill; one huge lucky tip does not." },
        ],
        drawdown: [
          { q: "What is the max. overall loss in Phases 1 and 2?", a: ["−5 %, trailing", "−10 %, static (a fixed floor)", "−4 %, static", "−20 %"], c: 1, e: "In the Challenge and Verification the floor is fixed at −10 % of capital and never moves." },
          { q: "With $4,000 capital, where is the static floor in Phase 1?", a: ["$3,600", "$3,840", "$3,400"], c: 0, e: "$4,000 − 10 % = $3,600." },
          { q: "What is the daily loss limit on a $1,000 account?", a: ["$40", "$100", "$15"], c: 0, e: "4 % of $1,000 = $40." },
          { q: "Phase 3, $25,000 capital, highest balance $27,000. Where is the trailing floor?", a: ["$22,500", "$24,300", "$25,000"], c: 1, e: "In Phase 3 the floor trails your highest balance: $27,000 − 10 % = $24,300." },
          { q: "When does the daily loss counter reset?", a: ["At midnight UTC", "At midnight your local time", "After every tip"], c: 0, e: "The daily loss limit resets at midnight UTC — mind the time difference to your local time." },
        ],
        "line-movement": [
          { q: "The odds drop from 2.20 to 1.90. What does that mean?", a: ["The market believes in the outcome more — the implied probability rose", "The outcome is now certain", "The market believes in the outcome less"], c: 0, e: "1 ÷ 2.20 ≈ 45.5 % and 1 ÷ 1.90 ≈ 52.6 %. Lower odds = higher implied probability, but the outcome is still not certain." },
          { q: "What usually causes a big pre-match move in the odds?", a: ["New information — line-ups, injuries, rotation, weather", "Pure chance with no reason", "How many tips are made on Fundly"], c: 0, e: "Markets react to information. Find out why the odds moved before you react to it." },
          { q: "What is the closing line?", a: ["The odds just before the match starts", "The highest odds ever offered", "The odds after the match ends"], c: 0, e: "The closing line is the market's final price before kick-off — usually its most informed one." },
          { q: "You took odds of 2.10 and the closing odds were 1.95. What does that tell you?", a: ["You got a better price than the market's final one — over time a sign your analysis is ahead", "The tip is automatically successful", "You made a mistake"], c: 0, e: "Regularly beating the closing line is a good sign of a strong process, even though any single tip can still lose." },
          { q: "Which use of odds data do the rules forbid?", a: ["Exploiting stale data feeds and tipping on matches that have already started or finished", "Watching how odds move over time", "Comparing your odds with the closing line"], c: 0, e: "Latency exploitation and courtsiding are forbidden strategies (Challenge Rules, section 6)." },
        ],
        "discipline-tilt": [
          { q: "What is tilt?", a: ["A state where emotions override your plan and decisions", "A type of multi-match tip", "The daily loss rule"], c: 0, e: "Tilt can follow frustration after losses as well as euphoria after a good streak." },
          { q: "After three losses in a row you feel you must win it back fast. What is sensible?", a: ["Take a break and go back to your plan", "Raise the entry to the maximum", "Make several tips at once"], c: 0, e: "A break stops emotional decisions. The daily loss limit is a safety net, not a target." },
          { q: "What should your plan include?", a: ["Entry size, max. number of tips per day and the sports or leagues you know", "Only the target amount", "A list of the day's highest odds"], c: 0, e: "A written plan decided in advance is much harder to break in the heat of the moment." },
          { q: "Why keep a tipping journal?", a: ["To judge your decisions and process, not just the result", "It is required for rewards", "So you can change tips afterwards"], c: 0, e: "A good decision can still lose and a bad one can still succeed — the journal shows which is which." },
          { q: "You have 30 days for the phase and after a week you're at +2 %. What does that mean?", a: ["Nothing bad — about +0.35 % of capital per day on average is enough, no need to rush", "You must raise your entries or you won't make it", "The phase is lost"], c: 0, e: "The remaining +8 % over 23 days is roughly +0.35 % per day. Rushing is exactly what leads to tilt." },
        ],
        "evaluation-steps": [
          { q: "What are the profit targets in Phase 1 and Phase 2?", a: ["+10 % and +5 % of capital", "+5 % and +10 %", "+8 % in both"], c: 0, e: "Phase 1 (Challenge) +10 %, Phase 2 (Verification) +5 % of capital, 30 days each." },
          { q: "Which odds range is allowed per selection in a tip?", a: ["1.00 to 8.00", "1.50 to 3.00", "Any odds"], c: 0, e: "The permitted odds range is 1.00 to 8.00 per selection." },
          { q: "$2,000 capital, Phase 1. Under the consistency rule, what is the highest potential profit a single tip may have?", a: ["$80", "$200", "$30"], c: 0, e: "40 % of the +10 % target = 4 % of capital, i.e. $80. In Phase 2 it is 2 % of capital." },
          { q: "How many open tips can you have on one match at a time?", a: ["One", "Two", "Unlimited"], c: 0, e: "Only one open (pending) tip per match is allowed at a time." },
          { q: "What do you need before your first reward request in Phase 3?", a: ["The $80 activation, a +5 % profit buffer, 5 qualifying tips and identity verification (KYC)", "Only a 30-day wait", "Nothing, rewards are sent automatically"], c: 0, e: "All of these are required; requests are then reviewed within 24 hours. No reward is guaranteed." },
        ],
      },
    },
    cs: {
      hero_t: "Nauč se pravidla hry, než začneš",
      hero_d: "Osm krátkých lekcí, každá s kvízem — od řízení kapitálu po celé hodnocení. Za splněné kvízy získáš odznaky Akademie.",
      pass_rule: "Ke splnění: 80 % správně",
      progress: "Splněno {n} z {total} lekcí",
      quiz_btn: "Kvíz", quiz_retry: "Zkusit kvíz znovu", quiz_close: "Zavřít", quiz_hide: "Skrýt kvíz",
      quiz_title: "Kvíz: {title}", quiz_meta: "{n} otázek · ke splnění 80 %",
      correct: "Správně.", wrong: "Tohle ne.",
      result_pass: "Splněno — {score} % ({ok} z {n}). Lekce je hotová ✓",
      result_fail: "{score} % ({ok} z {n}). Ke splnění potřebuješ 80 % — projdi si lekci znovu a zkus kvíz ještě jednou.",
      status_done: "Hotovo · nejlépe {score} %", status_tried: "Nejlépe {score} % · zatím nesplněno", status_new: "5 otázek",
      saved_local: "Postup se ukládá v tomhle prohlížeči. Přihlas se a budeš ho mít na všech zařízeních.",
      badges_t: "Odznaky Akademie",
      b_start: "Začátek", b_start_d: "Splň první kvíz",
      b_four: "4 lekce", b_four_d: "Splň 4 kvízy",
      b_all: "Absolvent akademie", b_all_d: "Splň všech 8 kvízů",
      b_locked: "Zamčeno", b_earned: "Získáno",
      live_k: "Měsíční živá analýza zápasů",
      live_next: "Další živá analýza: {date}",
      live_now: "Právě živě: {date}",
      live_soon: "Brzy začínáme: {date}",
      live_past: "Poslední živá analýza: {date}",
      live_note: "Společně projdeme nadcházející zápasy a vysvětlíme, jak je čteme. Vzdělávací obsah, žádné tipy k následování.",
      live_cal: "Přidat do kalendáře", live_join: "Připojit se", live_replay: "Pustit záznam",
      live_title_fallback: "Fundly živá analýza zápasů",
      lm_t: "Čtení pohybu kurzů",
      lm_p: "Kurzy se před zápasem hýbou. Pohyb ti ukazuje, kam se přesouvají peníze trhu a informace — ne to, kdo zvítězí.",
      lm_1: "Klesající kurz (např. 2.20 → 1.90) znamená, že trh výsledku věří víc: implikovaná pravděpodobnost vzrostla ze 45,5 % na 52,6 %.",
      lm_2: "Velké pohyby obvykle přicházejí po zprávách — sestavy, zranění, rotace, počasí. Než zareaguješ, zjisti, proč se kurz pohnul.",
      lm_3: "Kurz, který už klesl, nabízí horší cenu. Pozdní naskočení za trhem obvykle znamená menší hodnotu.",
      lm_4: "Porovnej kurz, za který jsi tip podal, se závěrečným kurzem (closing line, těsně před začátkem). Když závěrečný kurz pravidelně překonáváš, tvoje analýza bývá napřed před trhem.",
      lm_warn: "Kurzy na Fundly pocházejí z feedu Betano. Zneužívání zpožděných dat (latence) a tipy na zápasy, které už začaly nebo skončily, jsou zakázané.",
      dt_t: "Disciplína a tilt",
      dt_p: "Tilt je stav, kdy emoce — frustrace po ztrátě nebo euforie po sérii — přebijí tvůj plán. Víc účtů končí kvůli tiltu než kvůli špatné analýze.",
      dt_1: "Měj pevný plán: velikost vkladu, max. počet tipů za den a sporty, které tipuješ. Napiš si ho předem.",
      dt_2: "Po dvou až třech ztrátách v řadě si dej pauzu. Denní limit ztráty −4 % je pojistka, ne cíl.",
      dt_3: "Nezvyšuj vklady po ztrátě a neber dobrou sérii jako důvod víc riskovat — výkyvy jsou normální.",
      dt_4: "Veď si deník: proč jsi tip podal, za jaký kurz a co sis z toho odnesl. Hodnoť rozhodnutí, ne jen výsledek.",
      dt_5: "Na každou fázi máš 30 dní — cíl nemusíš splnit za týden.",
      ev_t: "Jak funguje hodnocení krok za krokem",
      ev_1: "Vybereš si balíček a dostaneš simulovaný kapitál ve virtuálních kreditech — žádný tip neplatíš vlastními penězi.",
      ev_2: "Fáze 1 — Challenge: cíl +10 % kapitálu do 30 dní a aspoň 5 kvalifikačních tipů (každý s čistým ziskem aspoň +0,5 % kapitálu).",
      ev_3: "Po celou dobu platí limity: max. celková ztráta −10 % (ve Fázích 1 a 2 statická), max. denní ztráta −4 % (nuluje se o půlnoci UTC), max. 1,5 % kapitálu na tip, kurzy 1.00–8.00 na volbu, jeden otevřený tip na zápas.",
      ev_4: "Pravidlo konzistence: potenciální zisk jednoho tipu nesmí přesáhnout 40 % cíle fáze (ve Fázi 1 to jsou 4 % kapitálu, ve Fázi 2 2 %).",
      ev_5: "Když splníš cíl i kvalifikační tipy, postup do další fáze potvrdí provozovatel po kontrole.",
      ev_6: "Fáze 2 — Verifikace: cíl +5 % do 30 dní, stejné limity jako ve Fázi 1.",
      ev_7: "Fáze 3 — Fundly Partner: bez časového limitu, max. ztráta −10 % klouzavá od tvého nejvyššího zůstatku, podíl 80 % na odměně za výkon. Po 14 dnech bez tipu se účet uzavře.",
      ev_8: "Odměny: jednorázová aktivace $80, rezerva zisku aspoň +5 %, 5 kvalifikačních tipů před každou žádostí, $10–$4 000 na žádost, aspoň 14 dní mezi odměnami a ověření totožnosti (KYC). Žádosti posuzujeme do 24 hodin.",
      ev_9: "Překročení limitu ztráty nebo nesplnění cíle fáze v čase účet uzavře. Reset stojí 40 % ceny balíčku (jednou pro každý uzavřený účet).",
      ev_rules: "Přečti si celá Pravidla výzvy →",
      quiz: {
        "capital-management": [
          { q: "Jaký je na Fundly maximální vklad na jeden tip?", a: ["0,5 % kapitálu", "1,5 % kapitálu", "5 % kapitálu", "Bez omezení"], c: 1, e: "Max. riziko na jeden tip je ve všech fázích 1,5 % kapitálu a platforma ho hlídá automaticky." },
          { q: "S kapitálem $4 000 — jaký nejvyšší vklad můžeš dát na jeden tip?", a: ["$40", "$60", "$200", "$400"], c: 1, e: "1,5 % z $4 000 = $60." },
          { q: "Tři tipy v řadě ti nevyšly. Co doporučuje lekce?", a: ["Zdvojnásobit další vklad, ať to rychle doženeš", "Držet stejnou velikost vkladu a svůj plán", "Přejít na nejvyšší kurzy v nabídce"], c: 1, e: "Doháněním ztrát vyššími vklady se účty nejčastěji dostanou ke dnu ztráty. Stejně velké vklady drží výkyvy pod kontrolou." },
          { q: "Proč se doporučují stejně velké vklady (1–2 % kapitálu)?", a: ["Jedna horší série tě nevyřadí a výsledky závisí na tvé analýze, ne na jednom šťastném tipu", "Protože s nimi cíl splníš vždycky", "Protože vyšší vklady nejsou nikdy povolené"], c: 0, e: "Malé a stálé vklady přežijí běžné výkyvy, takže dlouhodobý výsledek ukazuje kvalitu tvé analýzy." },
          { q: "Jak bys měl brát kapitál své výzvy?", a: ["Jako pevný rozpočet, který spravuješ podle plánu", "Jako číslo, které je potřeba co nejrychleji zdvojnásobit", "Jako bonus, na kterém moc nezáleží"], c: 0, e: "Kapitál ber jako pevný rozpočet, ne jako číslo, které máš přes noc zdvojnásobit." },
        ],
        odds: [
          { q: "Jaká je implikovaná pravděpodobnost u kurzu 2.50?", a: ["25 %", "40 %", "60 %", "250 %"], c: 1, e: "1 ÷ 2,50 = 0,40, tedy 40 %." },
          { q: "Vklad $20 při kurzu 1.80 vyjde. Jaká je celková návratnost?", a: ["$36", "$16", "$21,80", "$38"], c: 0, e: "Návratnost = vklad × kurz = $20 × 1,80 = $36 (z toho $16 je čistý zisk)." },
          { q: "Jaký je čistý zisk z úspěšného vkladu $10 při kurzu 3.00?", a: ["$30", "$20", "$13"], c: 1, e: "Návratnost je $30; po odečtení vkladu $10 zbývá čistý zisk $20." },
          { q: "Proč je součet implikovaných pravděpodobností všech výsledků přes 100 %?", a: ["Bookmaker má v kurzech marži", "Protože jeden z výsledků je jistý", "Je to chyba ve výpočtu"], c: 0, e: "Marže posouvá součet nad 100 % — kurzy jsou o něco nižší než „férové“." },
          { q: "Který kurz odpovídá nejnižší implikované pravděpodobnosti?", a: ["1.50", "2.00", "4.00"], c: 2, e: "Čím vyšší kurz, tím nižší pravděpodobnost: 1 ÷ 4,00 = 25 %." },
        ],
        "value-vs-arbitrage": [
          { q: "Co je value tip?", a: ["Tip, kde je kurz vyšší, než odpovídá skutečné pravděpodobnosti výsledku", "Tip s nejnižším kurzem v nabídce", "Pokrytí všech výsledků u různých bookmakerů"], c: 0, e: "Value znamená, že cena je lepší než skutečná šance — máš výhodu, ale pořád přijímáš výkyvy." },
          { q: "Co je arbitráž (sure bety)?", a: ["Pokrytí všech výsledků u různých bookmakerů kvůli zaručenému zisku", "Tip na favorita", "Spojení více zápasů do jednoho tipu"], c: 0, e: "Arbitráž zajistí všechny výsledky, takže na výsledku zápasu už nezáleží." },
          { q: "Je arbitráž na Fundly povolená?", a: ["Ano, když je zisk malý", "Ne — je zakázaná, systém ji automaticky označí a vede k uzavření účtu", "Jen ve Fázi 3"], c: 1, e: "Arbitráž a sure bety jsou zakázané ve všech fázích (Pravidla výzvy, čl. 6)." },
          { q: "Odhaduješ šanci týmu na 50 % a kurz je 2.30. Co to znamená?", a: ["Kurz implikuje asi 43,5 %, takže podle tvého odhadu má cena hodnotu — výsledek ale pořád jistý není", "Kurz je moc nízký, hodnotu nemá", "Výsledek je jistý"], c: 0, e: "1 ÷ 2,30 ≈ 43,5 %. Když je tvůj odhad vyšší než implikovaná pravděpodobnost, cena má podle tebe hodnotu — jednotlivý tip ale pořád může skončit ztrátou." },
          { q: "Co říkají pravidla o value a chybných kurzech?", a: ["Hledat value vlastní analýzou je dovoleno; systematicky zneužívat zjevné chyby nebo zpožděné kurzy je zakázané", "Jakýkoli tip s kurzem nad férovou hodnotou je zakázaný", "Pravidla se o tom nezmiňují"], c: 0, e: "Článek 6 zakazuje arbitráž a systematické zneužívání zjevných chyb v kurzech nebo zastaralých či zpožděných kurzů. Value, které najdeš vlastní analýzou, je právě ta hodnocená dovednost. Tipy označené automatickými signály se pouze přezkoumají." },
        ],
        "qualifying-tips": [
          { q: "Kolik kvalifikačních tipů potřebuješ ke splnění fáze?", a: ["3", "5", "7", "10"], c: 1, e: "Každá fáze vyžaduje aspoň 5 kvalifikačních úspěšných tipů." },
          { q: "Kapitál $2 000. Jaký nejmenší čistý zisk musí tip mít, aby byl kvalifikační?", a: ["$5", "$10", "$20", "$100"], c: 1, e: "0,5 % z $2 000 = $10." },
          { q: "Vklad $10 při kurzu 1.40 vyjde, kapitál je $2 000. Je tip kvalifikační?", a: ["Ano", "Ne — čistý zisk $4 je pod hranicí $10"], c: 1, e: "$10 × 1,40 = $14, čistý zisk je tedy $4, což je méně než 0,5 % kapitálu ($10)." },
          { q: "Platí podmínka kvalifikačních tipů i u odměn?", a: ["Ne, jen ve Fázi 1", "Ano — před každou žádostí o odměnu potřebuješ 5 nových kvalifikačních tipů", "Jen před první odměnou"], c: 1, e: "Počítadlo se po každé odměně nuluje, takže před další žádostí potřebuješ znovu 5 kvalifikačních tipů." },
          { q: "Proč pravidlo existuje?", a: ["Aby prokázalo stabilní, skutečné tipování — ne jeden šťastný all-in", "Aby se fáze prodloužila", "Aby omezilo počet tipů"], c: 0, e: "Několik smysluplných úspěšných tipů ukazuje dovednost, jeden velký šťastný tip ne." },
        ],
        drawdown: [
          { q: "Jaká je max. celková ztráta ve Fázích 1 a 2?", a: ["−5 %, klouzavá", "−10 %, statická (pevné dno)", "−4 %, statická", "−20 %"], c: 1, e: "V Challenge i Verifikaci je dno pevně na −10 % kapitálu a nikdy se neposouvá." },
          { q: "Kapitál $4 000. Kde je statické dno ve Fázi 1?", a: ["$3 600", "$3 840", "$3 400"], c: 0, e: "$4 000 − 10 % = $3 600." },
          { q: "Jaký je limit denní ztráty u účtu s kapitálem $1 000?", a: ["$40", "$100", "$15"], c: 0, e: "4 % z $1 000 = $40." },
          { q: "Fáze 3, kapitál $25 000, nejvyšší zůstatek $27 000. Kde je klouzavé dno?", a: ["$22 500", "$24 300", "$25 000"], c: 1, e: "Ve Fázi 3 se dno posouvá za nejvyšším zůstatkem: $27 000 − 10 % = $24 300." },
          { q: "Kdy se nuluje denní ztráta?", a: ["O půlnoci UTC", "O půlnoci tvého místního času", "Po každém tipu"], c: 0, e: "Limit denní ztráty se nuluje o půlnoci UTC — pozor na rozdíl oproti tvému místnímu času." },
        ],
        "line-movement": [
          { q: "Kurz klesne z 2.20 na 1.90. Co to znamená?", a: ["Trh výsledku věří víc — implikovaná pravděpodobnost vzrostla", "Výsledek je teď jistý", "Trh výsledku věří méně"], c: 0, e: "1 ÷ 2,20 ≈ 45,5 % a 1 ÷ 1,90 ≈ 52,6 %. Nižší kurz = vyšší implikovaná pravděpodobnost, výsledek ale jistý není." },
          { q: "Co obvykle způsobí velký pohyb kurzu před zápasem?", a: ["Nové informace — sestavy, zranění, rotace, počasí", "Čistá náhoda bez důvodu", "Počet tipů podaných na Fundly"], c: 0, e: "Trh reaguje na informace. Než na pohyb zareaguješ, zjisti, proč nastal." },
          { q: "Co je closing line (závěrečný kurz)?", a: ["Kurz těsně před začátkem zápasu", "Nejvyšší kurz, jaký kdy byl", "Kurz po skončení zápasu"], c: 0, e: "Závěrečný kurz je poslední cena trhu před začátkem — obvykle ta nejlépe informovaná." },
          { q: "Tip jsi podal za kurz 2.10 a závěrečný kurz byl 1.95. Co z toho plyne?", a: ["Dostal jsi lepší cenu než trh na konci — dlouhodobě znak, že tvoje analýza bývá napřed", "Tip automaticky vyjde", "Udělal jsi chybu"], c: 0, e: "Pravidelné překonávání závěrečného kurzu je dobrý znak kvalitního postupu, i když jednotlivý tip pořád může skončit ztrátou." },
          { q: "Které využití dat o kurzech pravidla zakazují?", a: ["Zneužívání zpožděných datových feedů a tipy na zápasy, které už začaly nebo skončily", "Sledování, jak se kurzy v čase hýbou", "Porovnání svého kurzu se závěrečným"], c: 0, e: "Zneužívání latence i courtsiding patří mezi zakázané strategie (Pravidla výzvy, čl. 6)." },
        ],
        "discipline-tilt": [
          { q: "Co je tilt?", a: ["Stav, kdy emoce přebijí tvůj plán a rozhodování", "Druh tipu na více zápasů", "Pravidlo denní ztráty"], c: 0, e: "Tilt může přijít po frustraci ze ztrát, ale i po euforii z dobré série." },
          { q: "Po třech ztrátách v řadě máš pocit, že to musíš rychle dohnat. Co je rozumné?", a: ["Dát si pauzu a vrátit se k plánu", "Zvýšit vklad na maximum", "Podat několik tipů naráz"], c: 0, e: "Pauza zastaví emotivní rozhodování. Denní limit ztráty je pojistka, ne cíl." },
          { q: "Co by měl obsahovat tvůj plán?", a: ["Velikost vkladu, max. počet tipů za den a sporty či ligy, které znáš", "Jen cílovou částku", "Seznam nejvyšších kurzů dne"], c: 0, e: "Plán sepsaný předem se v zápalu chvíle porušuje mnohem hůř." },
          { q: "Proč si vést deník tipů?", a: ["Abys hodnotil svá rozhodnutí a postup, ne jen výsledek", "Je to podmínka pro odměnu", "Abys mohl tipy dodatečně měnit"], c: 0, e: "Dobré rozhodnutí může skončit ztrátou a špatné může vyjít — deník ukáže, co je co." },
          { q: "Na fázi máš 30 dní a po týdnu jsi na +2 %. Co z toho plyne?", a: ["Nic špatného — v průměru stačí zhruba +0,35 % kapitálu denně, není kam spěchat", "Musíš zvýšit vklady, jinak to nestihneš", "Fáze je ztracená"], c: 0, e: "Zbývajících +8 % za 23 dní je zhruba +0,35 % denně. Právě spěch vede k tiltu." },
        ],
        "evaluation-steps": [
          { q: "Jaké jsou cíle zisku ve Fázi 1 a ve Fázi 2?", a: ["+10 % a +5 % kapitálu", "+5 % a +10 %", "+8 % v obou"], c: 0, e: "Fáze 1 (Challenge) +10 %, Fáze 2 (Verifikace) +5 % kapitálu, na každou 30 dní." },
          { q: "Jaké rozpětí kurzů je povolené na jednu volbu v tipu?", a: ["1.00 až 8.00", "1.50 až 3.00", "Jakýkoli kurz"], c: 0, e: "Povolené rozpětí kurzů je 1.00 až 8.00 na každou volbu." },
          { q: "Kapitál $2 000, Fáze 1. Jaký nejvyšší potenciální zisk smí mít jeden tip podle pravidla konzistence?", a: ["$80", "$200", "$30"], c: 0, e: "40 % z cíle +10 % = 4 % kapitálu, tedy $80. Ve Fázi 2 jsou to 2 % kapitálu." },
          { q: "Kolik otevřených tipů můžeš mít v jednu chvíli na jeden zápas?", a: ["Jeden", "Dva", "Neomezeně"], c: 0, e: "Na jeden zápas smíš mít v jednu chvíli otevřený (nevyhodnocený) jen jeden tip." },
          { q: "Co potřebuješ před první žádostí o odměnu ve Fázi 3?", a: ["Aktivaci $80, rezervu zisku +5 %, 5 kvalifikačních tipů a ověření totožnosti (KYC)", "Jen počkat 30 dní", "Nic, odměna přijde automaticky"], c: 0, e: "Potřebuješ všechno z toho; žádost pak posoudíme do 24 hodin. Žádná odměna není zaručená." },
        ],
      },
    },
  };

  // ---------- čistá logika (testovatelná v Node) ----------
  // answers[i] = index možnosti, kterou hráč u otázky i zvolil (nebo null)
  function scoreQuiz(questions, answers) {
    const n = questions.length;
    let ok = 0;
    for (let i = 0; i < n; i++) if (answers[i] === questions[i].c) ok++;
    const pct = n ? Math.round((ok / n) * 100) : 0;
    return { ok, n, score: pct, passed: n > 0 && ok / n >= PASS };
  }

  // sloučení dvou záznamů jedné lekce: nejlepší skóre, splněno jednou = splněno navždy,
  // completed_at = nejdřívější splnění
  function mergeRecord(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    const passed = !!(a.passed || b.passed);
    const times = [a, b].filter((r) => r.passed && r.completed_at).map((r) => r.completed_at).sort();
    return { score: Math.max(a.score || 0, b.score || 0), passed, completed_at: passed ? times[0] || null : null };
  }
  function sameRecord(a, b) {
    return !!a && !!b && a.score === b.score && !!a.passed === !!b.passed && (a.completed_at || null) === (b.completed_at || null);
  }
  function countPassed(progress) {
    return LESSONS.filter((id) => progress[id] && progress[id].passed).length;
  }
  function badgeState(progress) {
    const n = countPassed(progress);
    return { start: n >= 1, four: n >= 4, all: n >= LESSONS.length, n };
  }

  // stav živé analýzy podle času: hidden | upcoming | live | past
  function liveState(cfg, now) {
    if (!cfg || !cfg.date) return { state: "hidden" };
    const start = Date.parse(cfg.date);
    if (!Number.isFinite(start)) return { state: "hidden" };
    const dur = Math.max(15, Number(cfg.duration_min) || LIVE_DEFAULT_MIN) * 60000;
    const end = start + dur;
    if (now < start - LIVE_JOIN_BEFORE_MS) return { state: "upcoming", start, end };
    if (now <= end) return { state: "live", start, end };
    return { state: cfg.replay_url ? "past" : "hidden", start, end };
  }

  function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  }
  function icsDate(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }
  function buildIcs({ start, end, title, description, url }) {
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Fundly//Academy//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:academy-live-" + icsDate(start) + "@fundly.games",
      "DTSTAMP:" + icsDate(Date.now()),
      "DTSTART:" + icsDate(start),
      "DTEND:" + icsDate(end),
      "SUMMARY:" + icsEscape(title),
      "DESCRIPTION:" + icsEscape(description + (url ? "\n" + url : "")),
    ];
    if (url) lines.push("URL:" + icsEscape(url));
    lines.push("BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:" + icsEscape(title), "END:VALARM", "END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  const core = { LESSONS, PASS, STR, scoreQuiz, mergeRecord, countPassed, badgeState, liveState, buildIcs };
  if (typeof module !== "undefined" && module.exports) module.exports = core;

  if (typeof FUNDLY_I18N !== "undefined") {
    FUNDLY_I18N.extend("en", { acad: STR.en });
    FUNDLY_I18N.extend("cs", { acad: STR.cs });
  }
  if (typeof document === "undefined") return;

  // ---------- DOM ----------
  const view = document.getElementById("view-akademie");
  if (!view) return;

  const tr = (k) => (typeof FUNDLY_I18N !== "undefined" ? FUNDLY_I18N.t("acad." + k) : STR.en[k]);
  const trf = (k, vars) => String(tr(k)).replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] !== undefined ? vars[key] : m));
  const uiLang = () => {
    let l = "en";
    try { l = (typeof FUNDLY_I18N !== "undefined" && FUNDLY_I18N.getLang()) || "en"; } catch (e) { /* */ }
    return l;
  };
  const quizFor = (id) => {
    const q = tr("quiz");
    return (q && typeof q === "object" && q[id]) || STR.en.quiz[id] || [];
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (typeof u === "string" && /^https:\/\//i.test(u.trim()) ? u.trim() : "");
  const lessonTitle = (id) => {
    const h = document.querySelector(`#acad-${id} h3`);
    return h ? h.textContent.trim() : id;
  };

  // statické acad.* texty: i18n.js je při načtení přeložil ještě bez našeho slovníku
  function translateStatic() {
    if (typeof FUNDLY_I18N === "undefined") return;
    view.querySelectorAll('[data-i18n^="acad."]').forEach((el) => { el.textContent = FUNDLY_I18N.t(el.getAttribute("data-i18n")); });
  }

  // ---------- postup (localStorage + Supabase) ----------
  let progress = {};
  let user = null;
  let client = null;
  const keyFor = (uid) => (uid ? `${LS_KEY}:${uid}` : LS_KEY);
  function readLocal(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "{}");
      return v && typeof v === "object" ? v : {};
    } catch (e) { return {}; }
  }
  function writeLocal(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) { /* bez localStorage jen v paměti */ }
  }
  function mergeAll(...maps) {
    const out = {};
    maps.forEach((m) => Object.entries(m || {}).forEach(([id, r]) => {
      if (LESSONS.includes(id) && r && typeof r === "object") out[id] = mergeRecord(out[id], { score: Number(r.score) || 0, passed: !!r.passed, completed_at: r.completed_at || null });
    }));
    return out;
  }
  const row = (id, r) => ({ user_id: user.id, lesson_id: id, score: r.score, passed: r.passed, completed_at: r.completed_at });

  async function syncRemote() {
    try {
      if (typeof FundlyBackend === "undefined") return;
      client = await FundlyBackend.getClient();
      if (!client) return;
      const { data } = await client.auth.getSession();
      user = (data && data.session && data.session.user) || null;
      if (!user) return;
      const { data: rows, error } = await client.from("academy_progress").select("lesson_id, score, passed, completed_at");
      if (error) throw error;
      const remote = {};
      (rows || []).forEach((r) => { remote[r.lesson_id] = r; });
      const anon = readLocal(LS_KEY);
      const merged = mergeAll(remote, readLocal(keyFor(user.id)), anon);
      const remoteNorm = mergeAll(remote);
      const up = Object.keys(merged).filter((id) => !sameRecord(merged[id], remoteNorm[id])).map((id) => row(id, merged[id]));
      if (up.length) {
        const { error: upErr } = await client.from("academy_progress").upsert(up, { onConflict: "user_id,lesson_id" });
        if (upErr) throw upErr;
      }
      // postup z doby bez přihlášení teď patří tomuhle účtu
      try { localStorage.removeItem(LS_KEY); } catch (e) { /* */ }
      progress = merged;
      writeLocal(keyFor(user.id), progress);
      renderAll();
    } catch (e) {
      // tabulka ještě není nasazená / offline → zůstává lokální postup
      if (user) {
        progress = mergeAll(progress, readLocal(keyFor(user.id)));
        renderAll();
      }
    }
  }

  async function saveResult(id, res) {
    const rec = mergeRecord(progress[id], { score: res.score, passed: res.passed, completed_at: res.passed ? new Date().toISOString() : null });
    progress[id] = rec;
    writeLocal(keyFor(user && user.id), progress);
    if (user && client) {
      try { await client.from("academy_progress").upsert(row(id, rec), { onConflict: "user_id,lesson_id" }); } catch (e) { /* dosynchronizuje se při dalším načtení */ }
    }
  }

  // ---------- hlavička: postup + odznaky ----------
  const BADGE_ICON = {
    start: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="currentColor"/>',
    four: '<path d="M4 19V9l8-5 8 5v10h-5v-6H9v6z" fill="currentColor"/>',
    all: '<path d="M2 9l10-5 10 5-10 5z" fill="currentColor"/><path d="M6 11.2V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.8l-6 3z" fill="currentColor" opacity=".75"/><path d="M21 9.5V15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  };
  function renderHeader() {
    const b = badgeState(progress);
    const label = document.getElementById("acadProgressLabel");
    if (label) label.textContent = trf("progress", { n: b.n, total: LESSONS.length });
    const bar = document.getElementById("acadProgressBar");
    if (bar) bar.style.width = Math.round((b.n / LESSONS.length) * 100) + "%";
    const box = document.getElementById("acadBadges");
    if (!box) return;
    const items = [["start", b.start], ["four", b.four], ["all", b.all]];
    box.setAttribute("aria-label", tr("badges_t"));
    box.innerHTML = items.map(([k, on]) => `
      <div class="acad-badge b-${k}${on ? " on" : ""}" role="listitem">
        <span class="acad-medal" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none">${BADGE_ICON[k]}</svg></span>
        <span class="acad-badge-txt"><b>${esc(tr("b_" + k))}</b><small>${esc(on ? tr("b_earned") : tr("b_" + k + "_d"))}</small></span>
        <span class="acad-sr">${esc(on ? tr("b_earned") : tr("b_locked"))}</span>
      </div>`).join("");
  }

  function renderLessonStatus(id) {
    const card = document.getElementById("acad-" + id);
    if (!card) return;
    const r = progress[id];
    card.classList.toggle("done", !!(r && r.passed));
    const st = card.querySelector("[data-status]");
    if (st) st.textContent = r ? (r.passed ? trf("status_done", { score: r.score }) : trf("status_tried", { score: r.score })) : tr("status_new");
    const btn = card.querySelector("[data-quiz-open]");
    if (btn) btn.textContent = quizzes[id] ? tr("quiz_hide") : r ? tr("quiz_retry") : tr("quiz_btn");
  }

  // ---------- kvíz ----------
  const quizzes = {}; // id → { answers: [] } pro otevřené kvízy

  function renderQuiz(id) {
    const card = document.getElementById("acad-" + id);
    const box = card && card.querySelector("[data-quiz]");
    if (!box) return;
    const st = quizzes[id];
    if (!st) { box.hidden = true; box.innerHTML = ""; card.classList.remove("quiz-open"); return; }
    const qs = quizFor(id);
    const done = qs.every((_, i) => st.answers[i] !== null && st.answers[i] !== undefined);
    card.classList.add("quiz-open");
    box.hidden = false;
    box.innerHTML = `
      <div class="acad-quiz-top"><b>${esc(trf("quiz_title", { title: lessonTitle(id) }))}</b><span class="t-meta">${esc(trf("quiz_meta", { n: qs.length }))}</span></div>
      <ol class="acad-qs">${qs.map((q, i) => {
        const chosen = st.answers[i];
        const answered = chosen !== null && chosen !== undefined;
        return `<li class="acad-q${answered ? (chosen === q.c ? " ok" : " bad") : ""}">
          <p class="acad-q-text" id="acadq-${id}-${i}">${esc(q.q)}</p>
          <div class="acad-opts" role="group" aria-labelledby="acadq-${id}-${i}">${(st.order && st.order[i] && st.order[i].length === q.a.length ? st.order[i] : q.a.map((_, j) => j)).map((j) => {
            const a = q.a[j];
            const cls = answered ? (j === q.c ? " is-correct" : j === chosen ? " is-wrong" : " is-dim") : "";
            return `<button type="button" class="acad-opt${cls}" data-q="${i}" data-opt="${j}"${answered ? ' disabled aria-pressed="' + (j === chosen) + '"' : ""}>${esc(a)}</button>`;
          }).join("")}</div>
          ${answered ? `<p class="acad-expl" tabindex="-1"><b>${esc(chosen === q.c ? tr("correct") : tr("wrong"))}</b> ${esc(q.e)}</p>` : ""}
        </li>`;
      }).join("")}</ol>
      <div class="acad-result" aria-live="polite">${done ? resultHtml(id, qs, st) : ""}</div>`;
  }

  function resultHtml(id, qs, st) {
    const res = scoreQuiz(qs, st.answers);
    const note = !user ? `<p class="t-meta acad-local-note">${esc(tr("saved_local"))}</p>` : "";
    return `<div class="acad-result-box ${res.passed ? "pass" : "fail"}">
      <p>${esc(trf(res.passed ? "result_pass" : "result_fail", res))}</p>
      <div class="acad-result-actions">
        <button type="button" class="btn btn-ghost" data-quiz-retry="${id}">${esc(tr("quiz_retry"))}</button>
        <button type="button" class="btn btn-ghost" data-quiz-close="${id}">${esc(tr("quiz_close"))}</button>
      </div>${note}</div>`;
  }

  function openQuiz(id, focus) {
    // pořadí možností se při každém pokusu zamíchá (data-opt drží původní index)
    const qs = quizFor(id);
    quizzes[id] = { answers: qs.map(() => null), order: qs.map((q) => shuffle(q.a.map((_, j) => j))) };
    renderQuiz(id);
    renderLessonStatus(id);
    if (focus) {
      const first = document.querySelector(`#acad-${id} .acad-opt`);
      if (first) first.focus({ preventScroll: true });
      const top = document.querySelector(`#acad-${id} [data-quiz]`);
      if (top && top.scrollIntoView) top.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function closeQuiz(id) {
    delete quizzes[id];
    renderQuiz(id);
    renderLessonStatus(id);
    const btn = document.querySelector(`#acad-${id} [data-quiz-open]`);
    if (btn) btn.focus({ preventScroll: true });
  }

  view.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t || !view.contains(t)) return;
    if (t.dataset.quizOpen) {
      const id = t.dataset.quizOpen;
      if (quizzes[id]) closeQuiz(id); else openQuiz(id, true);
      return;
    }
    if (t.dataset.quizRetry) { openQuiz(t.dataset.quizRetry, true); return; }
    if (t.dataset.quizClose) { closeQuiz(t.dataset.quizClose); return; }
    if (t.classList.contains("acad-opt") && !t.disabled) {
      const card = t.closest(".acad-lesson");
      const id = card && card.dataset.lesson;
      const st = id && quizzes[id];
      if (!st) return;
      const qi = Number(t.dataset.q);
      if (st.answers[qi] !== null) return;
      st.answers[qi] = Number(t.dataset.opt);
      const qs = quizFor(id);
      const done = qs.every((_, i) => st.answers[i] !== null);
      renderQuiz(id);
      // tlačítka zodpovězené otázky jsou zamčená → fokus na vysvětlení (klávesnice / čtečky)
      const expl = card.querySelectorAll(".acad-q")[qi]?.querySelector(".acad-expl");
      if (expl) expl.focus({ preventScroll: true });
      if (done && !st.saved) {
        st.saved = true;
        const res = scoreQuiz(qs, st.answers);
        saveResult(id, res).then(() => { renderLessonStatus(id); renderHeader(); });
        renderLessonStatus(id);
        renderHeader();
      }
      return;
    }
    if (t.dataset.liveIcs !== undefined) { downloadIcs(); }
  });

  // ---------- měsíční živá analýza ----------
  let liveCfg = null;
  function liveTitle() {
    if (!liveCfg) return "";
    const cs = uiLang() === "cs" || uiLang() === "sk";
    return (cs ? liveCfg.title_cs || liveCfg.title_en : liveCfg.title_en || liveCfg.title_cs) || tr("live_title_fallback");
  }
  function fmtDate(ms) {
    try {
      return new Intl.DateTimeFormat(uiLang(), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(ms));
    } catch (e) { return new Date(ms).toLocaleString(); }
  }
  function renderLive() {
    const box = document.getElementById("acadLive");
    if (!box) return;
    const s = liveState(liveCfg, Date.now());
    if (s.state === "hidden") { box.hidden = true; box.innerHTML = ""; return; }
    const url = safeUrl(liveCfg.url);
    const replay = safeUrl(liveCfg.replay_url);
    const head = s.state === "live" && Date.now() < s.start ? "live_soon" : { upcoming: "live_next", live: "live_now", past: "live_past" }[s.state];
    const actions = [];
    if (s.state !== "past") actions.push(`<button type="button" class="btn btn-ghost" data-live-ics>${esc(tr("live_cal"))}</button>`);
    if (s.state === "live" && url) actions.push(`<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(tr("live_join"))}</a>`);
    if (s.state === "past" && replay) actions.push(`<a class="btn btn-primary" href="${esc(replay)}" target="_blank" rel="noopener noreferrer">${esc(tr("live_replay"))}</a>`);
    box.hidden = false;
    box.classList.toggle("is-live", s.state === "live");
    box.innerHTML = `
      <div class="acad-live-main">
        <div class="acad-live-k">${s.state === "live" && Date.now() >= s.start ? '<span class="acad-live-dot" aria-hidden="true"></span>' : ""}${esc(tr("live_k"))}</div>
        <div class="acad-live-t">${esc(liveTitle())}</div>
        <div class="acad-live-d">${esc(trf(head, { date: fmtDate(s.start) }))}</div>
        <p class="t-meta">${esc(tr("live_note"))}</p>
      </div>
      <div class="acad-live-actions">${actions.join("")}</div>`;
  }
  function downloadIcs() {
    const s = liveState(liveCfg, Date.now());
    if (!s.start) return;
    const ics = buildIcs({ start: s.start, end: s.end, title: liveTitle(), description: tr("live_note"), url: safeUrl(liveCfg.url) });
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fundly-live-analysis.ics";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  async function loadLive() {
    try {
      const res = await fetch("assets/academy/live.json", { cache: "no-store" });
      if (!res.ok) return;
      liveCfg = await res.json();
      renderLive();
    } catch (e) { /* bez live.json karta zůstane skrytá */ }
  }

  // ---------- celkové vykreslení ----------
  function renderAll() {
    LESSONS.forEach((id) => { renderLessonStatus(id); if (quizzes[id]) renderQuiz(id); });
    renderHeader();
    renderLive();
  }

  translateStatic();
  progress = mergeAll(readLocal(LS_KEY));
  renderAll();
  loadLive();
  // config.js / whop.js (FundlyBackend) se načítají s defer → běží až po tomhle skriptu
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncRemote, { once: true });
  else syncRemote();
  setInterval(renderLive, 60000); // přepnutí na „Připojit se“ / záznam bez obnovení stránky
  document.addEventListener("fundly:lang-changed", () => { translateStatic(); renderAll(); });
})();
