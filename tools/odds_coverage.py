#!/usr/bin/env python3
"""Analýza pokrytí kurzů v odds-api.io pro zvolené bookmakery.

Pro každý sport stáhne zápasy na N dní dopředu + aktuálně live zápasy, pak kurzy
zvolených bookmakerů a spočítá: kolik zápasů má kurzy, které ligy, kolik a jaké trhy,
marži hlavního trhu a detail MMA. Výstup jde do docs/odds-analysis/<datum>-<label>/,
aby šlo dva běhy (např. Tipsport vs Fortuna) porovnat přes --compare.

Použití:
  python3 -I tools/odds_coverage.py --label tipsport --bookmakers "Bet365,Tipsport.cz"
  python3 -I tools/odds_coverage.py --compare docs/odds-analysis/A docs/odds-analysis/B

Klíč: env ODDS_API_KEY, jinak se vezme z js/portfolio.js (veřejný klientský klíč).
Pozor: bookmakery v --bookmakers musí být zrovna zvolené na účtu odds-api, jinak 403.
Limit API je 5000 req/h sdílený s produkcí — skript se zastaví, když zbývá < --reserve.
"""
import argparse, json, os, re, statistics, subprocess, sys, time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://api.odds-api.io/v3"
MAIN_MARKET = "ML"

state = {"remaining": None, "requests": 0}


def api_key():
    k = os.environ.get("ODDS_API_KEY")
    if k:
        return k
    src = open(os.path.join(ROOT, "js/portfolio.js"), encoding="utf-8").read()
    m = re.search(r'const API_KEY\s*=\s*"([^"]+)"', src)
    if not m:
        sys.exit("ODDS_API_KEY chybí")
    return m.group(1)


def get(path, params, reserve):
    if state["remaining"] is not None and state["remaining"] < reserve:
        raise RuntimeError(f"rate-limit rezerva: zbývá {state['remaining']}")
    q = "&".join(f"{k}={quote(str(v), safe=',')}" for k, v in params.items())
    url = f"{API}{path}?{q}"
    for attempt in range(3):
        r = subprocess.run(["curl", "-s", "-m", "40", "-D", "-", url], capture_output=True)
        state["requests"] += 1
        raw = r.stdout.decode("utf-8", "replace")
        head, _, body = raw.partition("\r\n\r\n")
        while body.startswith("HTTP/"):  # 100-continue apod.
            head, _, body = body.partition("\r\n\r\n")
        m = re.search(r"x-ratelimit-remaining:\s*(\d+)", head, re.I)
        if m:
            state["remaining"] = int(m.group(1))
        status = re.match(r"HTTP/\S+\s+(\d+)", head)
        code = int(status.group(1)) if status else 0
        if code == 200:
            return json.loads(body)
        if code in (429, 500, 502, 503, 504) or code == 0:
            time.sleep(2 + attempt * 3)
            continue
        raise RuntimeError(f"{path} HTTP {code}: {body[:200]}")
    raise RuntimeError(f"{path}: opakovaně selhalo")


BUCKETS = ["live", "<24h", "1-3d", "3-7d", "7d+"]


def bucket(e, now, is_live):
    if is_live:
        return "live"
    try:
        h = (datetime.fromisoformat(e["date"].replace("Z", "+00:00")) - now).total_seconds() / 3600
    except Exception:
        return "7d+"
    return "<24h" if h < 24 else "1-3d" if h < 72 else "3-7d" if h < 168 else "7d+"


def margin(market):
    """Marže (overround) první linky trhu ML v %; None, když nejde spočítat."""
    try:
        line = market["odds"][0]
        prices = [float(line[k]) for k in ("home", "draw", "away") if line.get(k)]
        if len(prices) < 2 or any(p <= 1 for p in prices):
            return None
        return round((sum(1 / p for p in prices) - 1) * 100, 2)
    except Exception:
        return None


def analyze(args):
    key = api_key()
    bms = [b.strip() for b in args.bookmakers.split(",") if b.strip()]
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(days=args.days)
    outdir = os.path.join(ROOT, "docs/odds-analysis", f"{now:%Y-%m-%d}-{args.label}")
    rawdir = args.raw or os.path.join(outdir, "raw")
    os.makedirs(rawdir, exist_ok=True)
    os.makedirs(outdir, exist_ok=True)

    selected = get("/bookmakers/selected", {"apiKey": key}, args.reserve)
    sports = [s["slug"] for s in get("/sports", {"apiKey": key}, args.reserve)]
    if args.sports:
        sports = [s for s in sports if s in args.sports.split(",")]

    def fetch_events(sport):
        pend = get("/events", {"apiKey": key, "sport": sport, "status": "pending"}, args.reserve)
        live = get("/events/live", {"apiKey": key, "sport": sport}, args.reserve)
        keep = []
        for e in pend:
            try:
                d = datetime.fromisoformat(e["date"].replace("Z", "+00:00"))
            except Exception:
                continue
            if now - timedelta(hours=3) <= d <= horizon:
                keep.append(e)
        return sport, keep, live

    with ThreadPoolExecutor(4) as ex:
        ev_by_sport = {s: (p, l) for s, p, l in ex.map(fetch_events, sports)}

    def fetch_odds(ids):
        return get("/odds/multi", {"apiKey": key, "eventIds": ",".join(map(str, ids)),
                                   "bookmakers": ",".join(bms)}, args.reserve)

    report = {"label": args.label, "bookmakers": bms, "selectedOnAccount": selected,
              "generatedAt": now.isoformat(), "days": args.days, "sports": {}}
    for sport in sports:
        pend, live = ev_by_sport[sport]
        live_ids = {e["id"] for e in live}
        all_ev = {e["id"]: e for e in pend}
        for e in live:
            all_ev[e["id"]] = e
        ids = list(all_ev)
        chunks = [ids[i:i + 10] for i in range(0, len(ids), 10)]
        odds = []
        try:
            with ThreadPoolExecutor(4) as ex:
                for part in ex.map(fetch_odds, chunks):
                    odds.extend(part if isinstance(part, list) else [part])
        except RuntimeError as err:
            report.setdefault("errors", []).append(f"{sport}: {err}")
            print("!!", sport, err, file=sys.stderr)
        json.dump({"events": list(all_ev.values()), "odds": odds},
                  open(os.path.join(rawdir, f"{sport}.json"), "w"), ensure_ascii=False)

        s = {"events": len(ids), "liveEvents": len(live_ids), "byBookmaker": {}}
        odds_by_id = {o["id"]: o for o in odds if isinstance(o, dict) and "id" in o}
        for bm in bms:
            covered, live_cov, mcount, mfreq, margins = [], [], [], Counter(), []
            leagues = defaultdict(lambda: [0, 0])  # league -> [events, covered]
            buckets = defaultdict(lambda: [0, 0])  # čas do začátku -> [events, covered]
            for eid, e in all_ev.items():
                lg = (e.get("league") or {}).get("name", "?")
                leagues[lg][0] += 1
                bk = bucket(e, now, eid in live_ids)
                buckets[bk][0] += 1
                markets = ((odds_by_id.get(eid) or {}).get("bookmakers") or {}).get(bm) or []
                if not markets:
                    continue
                leagues[lg][1] += 1
                buckets[bk][1] += 1
                covered.append(eid)
                if eid in live_ids:
                    live_cov.append(eid)
                mcount.append(len(markets))
                for m in markets:
                    mfreq[m["name"]] += 1
                    if m["name"] == MAIN_MARKET:
                        mg = margin(m)
                        if mg is not None:
                            margins.append(mg)
            n = len(covered)
            s["byBookmaker"][bm] = {
                "eventsWithOdds": n,
                "coveragePct": round(100 * n / len(ids), 1) if ids else 0,
                "liveWithOdds": len(live_cov),
                "leaguesWithOdds": sum(1 for v in leagues.values() if v[1]),
                "byTimeToStart": {k: buckets[k] for k in BUCKETS if k in buckets},
                "marketsPerEventAvg": round(statistics.mean(mcount), 1) if mcount else 0,
                "marketsPerEventMedian": statistics.median(mcount) if mcount else 0,
                "marketsPerEventMax": max(mcount) if mcount else 0,
                "distinctMarkets": len(mfreq),
                "mainMarketMarginAvgPct": round(statistics.mean(margins), 2) if margins else None,
                "topMarkets": [[k, v, round(100 * v / n, 1)] for k, v in mfreq.most_common(40)],
                "allMarkets": sorted(mfreq),
                "leagues": sorted(([k, v[0], v[1]] for k, v in leagues.items() if v[1]),
                                  key=lambda x: -x[2]),
            }
        s["uncoveredLeagues"] = sorted(
            ([lg, n] for lg, n in Counter((e.get("league") or {}).get("name", "?") for e in all_ev.values()).items()
             if not any(lg == l[0] for bm in bms for l in s["byBookmaker"][bm]["leagues"])),
            key=lambda x: -x[1])[:60]
        if sport == "mixed-martial-arts":
            s["mmaEvents"] = []
            for eid, e in sorted(all_ev.items(), key=lambda kv: kv[1]["date"]):
                bmk = (odds_by_id.get(eid) or {}).get("bookmakers") or {}
                s["mmaEvents"].append({
                    "id": eid, "date": e["date"], "league": e["league"]["name"],
                    "fight": f'{e["home"]} vs {e["away"]}', "live": eid in live_ids,
                    "markets": {bm: [m["name"] for m in bmk.get(bm, [])] for bm in bms},
                })
        report["sports"][sport] = s
        print(f"{sport:20s} ev={len(ids):5d} " + " ".join(
            f'{bm}={s["byBookmaker"][bm]["eventsWithOdds"]}' for bm in bms), file=sys.stderr)

    report["apiRequests"] = state["requests"]
    report["rateLimitRemaining"] = state["remaining"]
    json.dump(report, open(os.path.join(outdir, "summary.json"), "w"), ensure_ascii=False, indent=1)
    open(os.path.join(outdir, "REPORT.md"), "w", encoding="utf-8").write(render(report))
    print(outdir)


def render(r):
    bms = r["bookmakers"]
    out = [f"# Pokrytí kurzů — {r['label']} ({r['generatedAt'][:16]} UTC)", "",
           f"Bookmakeři: {', '.join(bms)} · horizont {r['days']} dní + live · "
           f"{r['apiRequests']} požadavků na API", ""]
    out += ["## Přehled po sportech", "",
            "| Sport | Zápasy | Live | " + " | ".join(f"{b} zápasy (%) | {b} live | {b} trhy Ø | {b} marže ML" for b in bms) + " |",
            "|---|---:|---:|" + "---:|---:|---:|---:|" * len(bms)]
    for sp, s in sorted(r["sports"].items(), key=lambda kv: -kv[1]["events"]):
        if not s["events"]:
            continue
        cells = []
        for b in bms:
            x = s["byBookmaker"][b]
            mg = x["mainMarketMarginAvgPct"]
            cells.append(f'{x["eventsWithOdds"]} ({x["coveragePct"]} %) | {x["liveWithOdds"]} | '
                         f'{x["marketsPerEventAvg"]} | {"" if mg is None else str(mg) + " %"}')
        out.append(f"| {sp} | {s['events']} | {s['liveEvents']} | " + " | ".join(cells) + " |")
    out.append("")
    for sp, s in sorted(r["sports"].items(), key=lambda kv: -kv[1]["events"]):
        if not any(s["byBookmaker"][b]["eventsWithOdds"] for b in bms) and sp != "mixed-martial-arts":
            continue
        out += [f"## {sp}", ""]
        for b in bms:
            x = s["byBookmaker"][b]
            if not x["eventsWithOdds"]:
                out += [f"**{b}:** žádné kurzy.", ""]
                continue
            out += [f"**{b}:** {x['eventsWithOdds']}/{s['events']} zápasů, {x['leaguesWithOdds']} lig, "
                    f"trhy Ø {x['marketsPerEventAvg']} / medián {x['marketsPerEventMedian']} / max "
                    f"{x['marketsPerEventMax']}, {x['distinctMarkets']} různých trhů", "",
                    "Pokrytí podle času do začátku: " + ", ".join(
                        f"{k} {c}/{n}" for k, (n, c) in x["byTimeToStart"].items()), "",
                    "Ligy (zápasy s kurzy / všechny): " + ", ".join(
                        f"{l} {c}/{n}" for l, n, c in x["leagues"][:30]), "",
                    "Trhy (% zápasů): " + ", ".join(f"{k} {p} %" for k, _, p in x["topMarkets"][:25]), ""]
        if s.get("uncoveredLeagues"):
            out += ["Bez kurzů u žádného: " + ", ".join(f"{l} ({n})" for l, n in s["uncoveredLeagues"][:25]), ""]
        if s.get("mmaEvents"):
            out += ["| Datum | Turnaj | Zápas | " + " | ".join(bms) + " |", "|---|---|---|" + "---|" * len(bms)]
            for e in s["mmaEvents"]:
                out.append(f"| {e['date'][:16]} | {e['league']} | {e['fight']}{' 🔴' if e['live'] else ''} | " +
                           " | ".join(", ".join(e["markets"][b]) or "—" for b in bms) + " |")
            out.append("")
    if r.get("errors"):
        out += ["## Chyby", ""] + [f"- {e}" for e in r["errors"]]
    return "\n".join(out) + "\n"


def compare(a_dir, b_dir):
    A = json.load(open(os.path.join(a_dir, "summary.json")))
    B = json.load(open(os.path.join(b_dir, "summary.json")))
    out = [f"# Porovnání: {A['label']} vs {B['label']}", "",
           "| Sport | " + " | ".join(f"{r['label']}: {b}" for r in (A, B) for b in r["bookmakers"]) + " |",
           "|---|" + "---:|" * (len(A["bookmakers"]) + len(B["bookmakers"]))]
    for sp in sorted(set(A["sports"]) | set(B["sports"]), key=lambda s: -A["sports"].get(s, {"events": 0})["events"]):
        cells = []
        for r in (A, B):
            s = r["sports"].get(sp)
            for b in r["bookmakers"]:
                x = s and s["byBookmaker"][b]
                cells.append("—" if not x else f'{x["eventsWithOdds"]}/{s["events"]} · Ø{x["marketsPerEventAvg"]} trhů · live {x["liveWithOdds"]}')
        out.append(f"| {sp} | " + " | ".join(cells) + " |")
    text = "\n".join(out) + "\n"
    path = os.path.join(os.path.dirname(a_dir.rstrip("/")), f"COMPARE-{A['label']}-vs-{B['label']}.md")
    open(path, "w", encoding="utf-8").write(text)
    print(path)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--label")
    p.add_argument("--bookmakers")
    p.add_argument("--days", type=int, default=7)
    p.add_argument("--sports", help="čárkou oddělené slugy (default všechny)")
    p.add_argument("--reserve", type=int, default=1500, help="min. zbývajících požadavků pro produkci")
    p.add_argument("--raw", help="kam uložit surová data (default <out>/raw)")
    p.add_argument("--compare", nargs=2)
    a = p.parse_args()
    if a.compare:
        compare(*a.compare)
    else:
        if not (a.label and a.bookmakers):
            p.error("--label a --bookmakers jsou povinné")
        analyze(a)
