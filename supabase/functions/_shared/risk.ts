// _shared/risk.ts — server-side část risk-scoringu (anti-fraud).
// Klientská část (arbitráž, value-bety, rapid-fire, outlier kurzy, ...) se
// počítá v js/dashboard.js (computeRisk) a chodí přes sync-account jako
// riskScore/riskReasons. Tahle vrstva doplňuje signály, které klient vidět
// NEMŮŽE (napříč účty) — sdílené IP/platební metoda a rychlost postupu.
//
// Skórovací tabulka (dohodnuto s ownerem):
//   CRITICAL → +100 (kdekoli jeden stačí na auto-hold)
//   WARNING  → +15 každý
//   INFO     → +0 (jen kontext, nikdy sám o sobě důvod k akci)
// Prahy: skóre >=100 → hold (payout vyžaduje ruční potvrzení),
//        skóre 30–99 → watch (payout projde, účet se sleduje),
//        skóre <30   → clear.

export const RISK_CRITICAL = 100;
export const RISK_WARNING = 15;

export type WatchStatus = "clear" | "watch" | "hold";

export function watchStatusFor(score: number): WatchStatus {
  if (score >= 100) return "hold";
  if (score >= 30) return "watch";
  return "clear";
}

// deno-lint-ignore no-explicit-any
export async function computeServerRiskSignals(supabase: any, account: {
  id: string;
  signup_ip: string | null;
  payment_fingerprint: string | null;
  phase1_completed_at: string | null;
  funded_at: string | null;
  created_at: string;
  // deno-lint-ignore no-explicit-any
  betting_profile?: any;
}): Promise<{ score: number; reasons: string[] }> {
  let score = 0;
  const reasons: string[] = [];

  // Čtyři nezávislé dotazy (žádný nepotřebuje výsledek jiného) — dřív šly
  // sekvenčně za sebou, což u sync-account (volá se na KAŽDÉ podání sázky)
  // zbytečně natahovalo odezvu o stovky ms navíc. Paralelně trvá tenhle
  // úsek jako ten nejpomalejší jeden dotaz, ne součet všech čtyř.
  const [ipRes, fpRes, myTicketsRes] = await Promise.all([
    account.signup_ip
      ? supabase.from("challenge_accounts").select("id", { count: "exact", head: true })
          .eq("signup_ip", account.signup_ip).neq("id", account.id)
      : Promise.resolve({ count: 0 }),
    account.payment_fingerprint
      ? supabase.from("challenge_accounts").select("id", { count: "exact", head: true })
          .eq("payment_fingerprint", account.payment_fingerprint).neq("id", account.id)
      : Promise.resolve({ count: 0 }),
    supabase.from("tickets").select("selections, placed_at, first_start_time, status")
      .eq("account_id", account.id).order("placed_at", { ascending: false }).limit(300),
  ]);

  // SHARED_DEVICE_IP (CRITICAL): jiný účet se stejným IP při registraci.
  if (account.signup_ip && (ipRes.count ?? 0) > 0) {
    score += RISK_CRITICAL;
    reasons.push("SHARED_DEVICE_IP: sdílené IP s jiným účtem");
  }

  // SHARED_PAYMENT_METHOD (CRITICAL): jiný účet platil stejnou kartou/metodou.
  if (account.payment_fingerprint && (fpRes.count ?? 0) > 0) {
    score += RISK_CRITICAL;
    reasons.push("SHARED_PAYMENT_METHOD: stejná platební metoda jako jiný účet");
  }

  // FAST_TRACK (WARNING): fáze 1 dokončena extrémně rychle (< 3 dny od založení).
  if (account.phase1_completed_at) {
    const days = (new Date(account.phase1_completed_at).getTime() - new Date(account.created_at).getTime()) / 86400000;
    if (days >= 0 && days < 3) {
      score += RISK_WARNING;
      reasons.push(`FAST_TRACK: fáze 1 dokončena za ${days.toFixed(1)} dne`);
    }
  }

  // LOW_LIQUIDITY_CONCENTRATION (WARNING): > 70 % objemu na jediné lize,
  // spočítáno z betting_profile.topLeagues (bez potřeby tabulky tickets).
  const bp = account.betting_profile;
  if (bp?.topLeagues?.length) {
    const total = bp.topLeagues.reduce((a: number, l: { count: number }) => a + (Number(l.count) || 0), 0);
    const top = bp.topLeagues[0];
    if (total >= 10 && top && (Number(top.count) || 0) / total > 0.7) {
      score += RISK_WARNING;
      reasons.push(`LOW_LIQUIDITY_CONCENTRATION: ${Math.round((top.count / total) * 100)} % objemu na "${top.name}"`);
    }
  }

  // ---------- tikety na serveru (viz tickets tabulka + sync-tickets) ----------
  const tickets = myTicketsRes.data ?? [];

  if (tickets.length) {
    // BOT_PATTERN (WARNING): 5+ tiketů podaných během 10 minut, ze skutečných
    // server-side časů (na rozdíl od klientského self-reportu).
    const times = tickets.map((t: { placed_at: string }) => new Date(t.placed_at).getTime()).sort((a: number, b: number) => a - b);
    for (let i = 0; i + 4 < times.length; i++) {
      if (times[i + 4] - times[i] <= 10 * 60 * 1000) {
        score += RISK_WARNING;
        reasons.push("BOT_PATTERN: 5+ tiketů podaných během 10 minut (server-ověřeno)");
        break;
      }
    }

    // TIMING_ANOMALY (WARNING): vysoký podíl tiketů podaných < 5 min před
    // začátkem (nejbližšího) zápasu v tiketu.
    const withStart = tickets.filter((t: { first_start_time: string | null }) => t.first_start_time);
    if (withStart.length >= 5) {
      const lastMinute = withStart.filter((t: { placed_at: string; first_start_time: string }) =>
        new Date(t.first_start_time).getTime() - new Date(t.placed_at).getTime() <= 5 * 60 * 1000).length;
      if (lastMinute / withStart.length > 0.5) {
        score += RISK_WARNING;
        reasons.push(`TIMING_ANOMALY: ${Math.round((lastMinute / withStart.length) * 100)} % tiketů podáno < 5 min před uzávěrkou`);
      }
    }

    // LOW_VARIANCE (WARNING): podezřele stabilní win rate napříč okny po 10
    // vypořádaných tiketech (možný hedžing) — heuristika pro lidský review,
    // ne statisticky přesný test.
    const settled = tickets.filter((t: { status: string }) => t.status === "won" || t.status === "lost")
      .sort((a: { placed_at: string }, b: { placed_at: string }) => new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime());
    if (settled.length >= 30) {
      const windows: number[] = [];
      for (let i = 0; i + 10 <= settled.length; i += 10) {
        const chunk = settled.slice(i, i + 10);
        const wins = chunk.filter((t: { status: string }) => t.status === "won").length;
        windows.push(wins / 10);
      }
      if (windows.length >= 3) {
        const avg = windows.reduce((a, b) => a + b, 0) / windows.length;
        const maxDev = Math.max(...windows.map((w) => Math.abs(w - avg)));
        if (maxDev <= 0.1) {
          score += RISK_WARNING;
          reasons.push(`LOW_VARIANCE: win rate stabilní na ${Math.round(avg * 100)} % napříč ${windows.length} okny po 10 tiketech`);
        }
      }
    }

    // MULTI_ACCOUNT_COLLUSION (CRITICAL): jiný účet vsadil opačnou stranu
    // stejného trhu na stejný zápas. Selections jsou jsonb (tiket = akumulátor
    // víc zápasů), takže se rozplacují a porovnávají v JS — u větších objemů
    // dat by tohle chtělo vlastní indexovanou tabulku "selections", pro
    // aktuální objem tiketů stačí projet posledních pár set napříč účty.
    type Sel = { eventId: string | null; marketName: string | null; field: string | null };
    const flatten = (rows: { selections: Sel[] }[]) =>
      rows.flatMap((t) => (t.selections || []).map((s) => ({ eventId: s.eventId, marketName: s.marketName, field: s.field })));
    const mySelections = flatten(tickets as { selections: Sel[] }[]);
    const myEventIds = [...new Set(mySelections.map((s) => s.eventId).filter(Boolean))];

    if (myEventIds.length) {
      const { data: othersRaw } = await supabase
        .from("tickets")
        .select("account_id, selections")
        .neq("account_id", account.id)
        .order("placed_at", { ascending: false })
        .limit(1000);
      // deno-lint-ignore no-explicit-any
      const otherSelections = (othersRaw ?? []).flatMap((t: any) =>
        (t.selections || []).map((s: Sel) => ({ accountId: t.account_id, ...s })));
      const collision = otherSelections.find((o: Sel & { accountId: string }) =>
        mySelections.some((m) => m.eventId === o.eventId && m.marketName === o.marketName && m.field !== o.field));
      if (collision) {
        score += RISK_CRITICAL;
        reasons.push(`MULTI_ACCOUNT_COLLUSION: opačná sázka na event #${collision.eventId} jako jiný účet`);
      }
    }

    // ---------- FEED_LAG_PATTERN + HIGH_CLV: potřebují historii kurzů ----------
    // (viz odds_snapshots tabulka + odds-snapshot cron). Bez dat pro tuhle
    // konkrétní selekci se prostě přeskočí — nic se nevymýšlí.
    type FullSel = { eventId: string | null; marketName: string | null; field: string | null; hdp?: number | null; oddValue: number | null; startTime: string | null };
    const fullSelections = (tickets as { selections: FullSel[]; placed_at: string }[])
      .flatMap((t) => (t.selections || []).map((s) => ({ ...s, placedAt: t.placed_at })))
      .filter((s) => s.eventId && s.marketName && s.field && s.oddValue != null)
      .slice(0, 30); // dotazuje se sekvenčně per-selection, pojistka na dobu odezvy sync-account

    if (fullSelections.length >= 5) {
      const clvSamples: number[] = [];
      const lagHits: boolean[] = [];

      // Dřív se dotazovalo sekvenčně, jedna selekce po druhé — až 30 čekání
      // za sebou dokázalo samo o sobě natáhnout sync-account na ~2.5-3s,
      // což je přesně to okno, kde hráč stihne zavřít kartu dřív, než se
      // tiket uloží (viz "vsaď a hned zmiz historie"). Paralelně je to
      // pořád stejný počet dotazů, ale trvá to jako ten nejpomalejší jeden.
      const snapResults = await Promise.all(fullSelections.map((sel) =>
        supabase
          .from("odds_snapshots")
          .select("odd_value, captured_at")
          .eq("event_id", sel.eventId)
          .eq("market_name", sel.marketName)
          .eq("field", sel.field)
          .order("captured_at", { ascending: true })
      ));

      fullSelections.forEach((sel, i) => {
        const list = (snapResults[i]?.data ?? []) as { odd_value: number; captured_at: string }[];
        if (!list.length) return;

        // HIGH_CLV: poslední snapshot před začátkem zápasu = closing line.
        if (sel.startTime) {
          const beforeStart = list.filter((s) => new Date(s.captured_at).getTime() <= new Date(sel.startTime!).getTime());
          const closing = beforeStart[beforeStart.length - 1];
          if (closing && closing.odd_value > 0) {
            clvSamples.push((sel.oddValue! - closing.odd_value) / closing.odd_value);
          }
        }

        // FEED_LAG_PATTERN: první snapshot PO podání sázky — zkrátil se kurz
        // výrazně (>5 %) hned po tom, co vsadil?
        const afterBet = list.find((s) => new Date(s.captured_at).getTime() > new Date(sel.placedAt).getTime());
        if (afterBet && afterBet.odd_value > 0) {
          const move = (sel.oddValue! - afterBet.odd_value) / sel.oddValue!;
          lagHits.push(move > 0.05);
        }
      });

      if (clvSamples.length >= 5) {
        const avgClv = clvSamples.reduce((a, b) => a + b, 0) / clvSamples.length;
        if (avgClv > 0.03) {
          reasons.push(`INFO HIGH_CLV: v průměru +${Math.round(avgClv * 100)} % nad closing line (${clvSamples.length} vzorků)`);
        }
      }
      if (lagHits.length >= 5) {
        const hitRate = lagHits.filter(Boolean).length / lagHits.length;
        if (hitRate > 0.6) {
          score += RISK_WARNING;
          reasons.push(`FEED_LAG_PATTERN: kurz se v jeho prospěch zkrátil hned po sázce v ${Math.round(hitRate * 100)} % případů (${lagHits.length} vzorků)`);
        }
      }
    }
  }

  // Skóre se NEKAPUJE na 100 — víc CRITICAL nálezů najednou má vypadat
  // závažněji (viz příklad v zadání: skóre 130 = 2× CRITICAL + 1× WARNING).
  // Práh pro AUTO-HOLD (>=100) tím není dotčený, jen se neschovává skutečná závažnost.
  return { score, reasons };
}
