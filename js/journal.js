/* Fundly — Deník tipů.
   1) Na tiketu (renderSlip v js/dashboard.js) volitelné pole "Proč tento tip?" (max. 280 znaků)
      + důvody (štítky). Rozepsaný text drží `draft` tady — tiket se překresluje (přidání volby,
      přepnutí jazyka), ale pole se vždy vykreslí z draftu, takže se psaní neztratí; změny kurzů
      tiket nepřekreslují vůbec (patchSlipOdds). Při podání se draft předá Portfolio.placeBet()
      a uloží se k tiketu jako note / noteTags (server: tickets.note / note_tags, migrace 041).
   2) Záložka "Deník tipů" v sekci Nástroje: seznam tipů s poznámkou, filtr podle důvodu
      a tabulka "které úvahy fungují" (vyhodnocené tipy, úspěšnost, ROI podle důvodu).
   Texty: FUNDLY_I18N.extend, jmenný prostor "journal" (en + cs).
   JournalCore (bez DOM) jde načíst v node přes require() kvůli testům. */
(function () {
  "use strict";

  // Stejný whitelist hlídá supabase/functions/sync-tickets (NOTE_TAGS) a migrace 041.
  const TAGS = ["form", "injuries", "stats", "oddsvalue", "motivation", "home", "gut", "other"];
  const NOTE_MAX = 280;
  const HINT_MIN_TIPS = 5;
  const HINT_ROI = 15; // ± %

  const JournalCore = {
    TAGS, NOTE_MAX, HINT_MIN_TIPS, HINT_ROI,
    sanitizeNote(v) {
      if (typeof v !== "string") return "";
      return Array.from(v.replace(/\u0000/g, "").trim()).slice(0, NOTE_MAX).join("").trim();
    },
    sanitizeTags(v) {
      if (!Array.isArray(v)) return [];
      return TAGS.filter((t) => v.includes(t)); // pořadí podle whitelistu, bez duplicit
    },
    isSettled(t) { return ["won", "lost", "push", "cashedout"].includes(t && t.status); },
    hasEntry(t) { return !!(t && (t.note || (Array.isArray(t.noteTags) && t.noteTags.length))); },
    // souhrn pro skupinu tipů: vyhodnocené, úspěšnost (vyšel ÷ vyšel+nevyšel), ROI (čistý výsledek ÷ vklady)
    summarize(list) {
      let settled = 0, won = 0, lost = 0, staked = 0, returned = 0;
      for (const t of list) {
        if (!JournalCore.isSettled(t)) continue;
        settled += 1;
        if (t.status === "won") won += 1;
        if (t.status === "lost") lost += 1;
        staked += Number(t.stake) || 0;
        returned += Number(t.payout) || 0;
      }
      return {
        tips: list.length, settled, won, lost,
        winRate: won + lost > 0 ? (won / (won + lost)) * 100 : NaN,
        net: returned - staked,
        roi: staked > 0 ? ((returned - staked) / staked) * 100 : NaN,
      };
    },
    // per důvod + celkem (jen tipy se záznamem v deníku)
    computeStats(tickets) {
      const entries = (tickets || []).filter(JournalCore.hasEntry);
      const byTag = TAGS.map((tag) => ({ tag, ...JournalCore.summarize(entries.filter((t) => (t.noteTags || []).includes(tag))) }))
        .filter((r) => r.tips > 0)
        .sort((a, b) => b.settled - a.settled || b.tips - a.tips);
      const hints = byTag
        .filter((r) => r.settled >= HINT_MIN_TIPS && Number.isFinite(r.roi) && Math.abs(r.roi) > HINT_ROI)
        .map((r) => ({ tag: r.tag, kind: r.roi > 0 ? "good" : "bad", roi: r.roi, settled: r.settled }));
      return { entries, all: JournalCore.summarize(entries), byTag, hints };
    },
  };

  if (typeof module === "object" && module.exports) module.exports = JournalCore;
  if (typeof document === "undefined") return; // node (testy)

  // ---------- texty ----------
  const I18N = typeof FUNDLY_I18N !== "undefined" ? FUNDLY_I18N : null;
  if (I18N) {
    I18N.extend("en", { journal: {
      tag: {
        form: "Form", injuries: "Injuries & line-ups", stats: "Stats", oddsvalue: "Value in the odds",
        motivation: "Motivation", home: "Home advantage", gut: "Gut feeling", other: "Other",
      },
      slip: {
        why: "Why this tip?", optional: "optional", tags: "Reasons",
        placeholder: "E.g. the home side plays its third match in 5 days, the visitors get their captain back…",
        saved: "saved to your journal",
      },
      view: {
        title: "Tip journal",
        intro: "Your notes and reasons for the tips you've placed. Over time you'll see which kind of reasoning actually works for you.",
        empty: "No tips with a note yet. When you place a tip, fill in \"Why this tip?\" and pick your reasons — this is where you'll see which reasoning works.",
        scope: "The journal shows the tips of your current account.",
        statsTitle: "Which reasoning works",
        reason: "Reason", settled: "Settled", winRate: "Win rate", roi: "ROI", all: "All tips with a note",
        statsNote: "Win rate = tips that landed ÷ tips that landed or missed. ROI = net result ÷ total stakes of settled tips. A tip can have several reasons, so it counts towards each of them.",
        smallSample: "An evaluation appears once a reason has at least 5 settled tips.",
        hintGood: "\"{tag}\": ROI {roi} across {n} settled tips. This reasoning is working for you so far — keep an eye on whether it holds over a bigger sample.",
        hintBad: "\"{tag}\": ROI {roi} across {n} settled tips. This reasoning isn't working for you so far — consider whether you give it too much weight.",
        listTitle: "Entries", filterAll: "All", filterLabel: "Filter by reason",
        noMatch: "No entries with this reason.", noTags: "no reason picked",
        combo: "Combo · {n} selections", stakeOdds: "Stake {stake} · odds {odds}", result: "Result {net}",
        more: "Showing the latest {n} entries.",
      },
      status: { pending: "Pending", won: "Landed", lost: "Missed", push: "Refunded", cashedout: "Closed early" },
    } });
    I18N.extend("cs", { journal: {
      tag: {
        form: "Forma", injuries: "Zranění a sestavy", stats: "Statistiky", oddsvalue: "Value v kurzu",
        motivation: "Motivace", home: "Domácí prostředí", gut: "Intuice", other: "Jiné",
      },
      slip: {
        why: "Proč tento tip?", optional: "nepovinné", tags: "Důvody",
        placeholder: "Např. domácí hrají třetí zápas za 5 dní, hostům se vrací kapitán…",
        saved: "uloží se do deníku",
      },
      view: {
        title: "Deník tipů",
        intro: "Tvoje poznámky a důvody k podaným tipům. Časem uvidíš, které úvahy ti opravdu fungují.",
        empty: "Zatím žádné tipy s poznámkou. Při podání tipu vyplň „Proč tento tip?“ a vyber důvody — tady pak uvidíš, které úvahy ti fungují.",
        scope: "Deník ukazuje tipy tvého aktuálního účtu.",
        statsTitle: "Které úvahy fungují",
        reason: "Důvod", settled: "Vyhodnocené", winRate: "Úspěšnost", roi: "ROI", all: "Všechny tipy s poznámkou",
        statsNote: "Úspěšnost = vyšlé tipy ÷ vyšlé a nevyšlé tipy. ROI = čistý výsledek ÷ součet vkladů vyhodnocených tipů. Jeden tip může mít víc důvodů, takže se započítá u každého z nich.",
        smallSample: "Hodnocení se ukáže, jakmile má důvod aspoň 5 vyhodnocených tipů.",
        hintGood: "„{tag}“: ROI {roi} z {n} vyhodnocených tipů. Tahle úvaha ti zatím vychází — sleduj, jestli to vydrží i na větším vzorku.",
        hintBad: "„{tag}“: ROI {roi} z {n} vyhodnocených tipů. Tahle úvaha ti zatím nevychází — zvaž, jestli jí nedáváš příliš velkou váhu.",
        listTitle: "Záznamy", filterAll: "Vše", filterLabel: "Filtr podle důvodu",
        noMatch: "S tímto důvodem zatím nemáš žádný záznam.", noTags: "bez důvodu",
        combo: "Kombinace · výběrů: {n}", stakeOdds: "Vklad {stake} · kurz {odds}", result: "Výsledek {net}",
        more: "Zobrazeno posledních {n} záznamů.",
      },
      status: { pending: "Čeká na vyhodnocení", won: "Vyšel", lost: "Nevyšel", push: "Vráceno", cashedout: "Předčasně uzavřen" },
    } });
  }

  const T = (k) => (I18N ? I18N.t(`journal.${k}`) : k);
  const TF = (k, vars) => (I18N ? I18N.tf(`journal.${k}`, vars) : k);
  const lang = () => (I18N ? I18N.getLang() : "en");
  const locale = () => ({ cs: "cs-CZ", sk: "sk-SK", pl: "pl-PL", hu: "hu-HU", es: "es-ES" }[lang()] || "en-US");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n, d) => n.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (n, d = 1) => (Number.isFinite(n) ? num(n, d) + (lang() === "en" ? "%" : " %") : "—");
  const signedPct = (n) => (Number.isFinite(n) ? (n > 0 ? "+" : n < 0 ? "−" : "") + pct(Math.abs(n)) : "—");
  const signedUsd = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.round(Math.abs(n)).toLocaleString("en-US");
  const usd = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
  const tagLabel = (tag) => T(`tag.${tag}`);

  // ---------- tiket: pole poznámky ----------
  let draft = { note: "", tags: [], open: false };

  function slipFieldsHtml() {
    const len = Array.from(draft.note).length;
    const open = draft.open || draft.note || draft.tags.length;
    return `
      <details class="sj" id="slipJournal"${open ? " open" : ""}>
        <summary>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11 2.5l2.5 2.5L6 12.5 3 13l.5-3L11 2.5z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
          <span>${esc(T("slip.why"))}</span> <span class="sj-opt">(${esc(T("slip.optional"))})</span>
        </summary>
        <textarea class="input sj-note" id="slipNote" maxlength="${NOTE_MAX}" rows="3" placeholder="${esc(T("slip.placeholder"))}" aria-label="${esc(T("slip.why"))}">${esc(draft.note)}</textarea>
        <div class="sj-meta"><span>${esc(T("slip.saved"))}</span><span><span id="slipNoteCount">${len}</span>/${NOTE_MAX}</span></div>
        <div class="sj-tags" role="group" aria-label="${esc(T("slip.tags"))}">
          ${TAGS.map((tag) => `<button type="button" class="sj-chip" data-sj-tag="${tag}" aria-pressed="${draft.tags.includes(tag)}">${esc(tagLabel(tag))}</button>`).join("")}
        </div>
      </details>`;
  }

  // co se uloží s tiketem (null = nic nevyplněno)
  function getDraft() {
    const note = JournalCore.sanitizeNote(draft.note);
    const tags = JournalCore.sanitizeTags(draft.tags);
    return note || tags.length ? { note, tags } : null;
  }
  function clearDraft() { draft = { note: "", tags: [], open: false }; }

  // delegované události: tiket se kvůli psaní NIKDY nepřekresluje, jen se aktualizuje draft
  document.addEventListener("input", (e) => {
    if (e.target.id !== "slipNote") return;
    draft.note = e.target.value;
    const c = document.getElementById("slipNoteCount");
    if (c) c.textContent = Array.from(draft.note).length;
  });
  document.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-sj-tag]");
    if (chip) {
      const tag = chip.dataset.sjTag;
      draft.tags = draft.tags.includes(tag) ? draft.tags.filter((x) => x !== tag) : [...draft.tags, tag];
      chip.setAttribute("aria-pressed", String(draft.tags.includes(tag)));
      return;
    }
    const f = e.target.closest("[data-jr-filter]");
    if (f) {
      filterTag = f.dataset.jrFilter;
      render(document.getElementById("toolsJournal"));
    }
  });
  // toggle neprobublává → capture
  document.addEventListener("toggle", (e) => {
    if (e.target && e.target.id === "slipJournal") draft.open = e.target.open;
  }, true);

  // ---------- záložka Deník ----------
  let filterTag = "";
  const LIST_LIMIT = 100;

  function ticketTitle(t) {
    const sels = Array.isArray(t.selections) ? t.selections : [];
    if (sels.length > 1) return { title: TF("view.combo", { n: sels.length }), pick: sels.map((s) => s.pickLabel).filter(Boolean).join(" · ") };
    const s = sels[0] || {};
    const title = s.homeTeam || s.awayTeam ? `${s.homeTeam || ""} – ${s.awayTeam || ""}` : "—";
    return { title, pick: s.pickLabel || "" };
  }

  function entryHtml(t) {
    const { title, pick } = ticketTitle(t);
    const status = ["pending", "won", "lost", "push", "cashedout"].includes(t.status) ? t.status : "pending";
    const date = t.placedAt ? new Date(t.placedAt).toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "";
    const net = JournalCore.isSettled(t) ? (Number(t.payout) || 0) - (Number(t.stake) || 0) : null;
    const tags = (t.noteTags || []).filter((x) => TAGS.includes(x));
    return `
      <div class="jr-item">
        <div class="jr-head">
          <div class="jr-title">${esc(title)}${pick ? `<span class="jr-pick">${esc(pick)}</span>` : ""}</div>
          <span class="jr-status jr-${status}">${esc(T(`status.${status}`))}</span>
        </div>
        <div class="jr-meta">
          <span>${esc(date)}</span>
          <span>${esc(TF("view.stakeOdds", { stake: usd(t.stake), odds: num(Number(t.combinedOdds) || 1, 2) }))}</span>
          ${net !== null ? `<span class="${net > 0 ? "green" : net < 0 ? "red" : ""}">${esc(TF("view.result", { net: signedUsd(net) }))}</span>` : ""}
        </div>
        ${t.note ? `<p class="jr-note">${esc(t.note)}</p>` : ""}
        <div class="jr-tags">${tags.length ? tags.map((x) => `<span class="jr-tag">${esc(tagLabel(x))}</span>`).join("") : `<span class="t-meta">${esc(T("view.noTags"))}</span>`}</div>
      </div>`;
  }

  function statsRow(label, s, strong) {
    return `<tr${strong ? ' class="jr-total"' : ""}>
      <td>${esc(label)}</td>
      <td class="odds">${s.settled}</td>
      <td class="odds">${esc(pct(s.winRate))}</td>
      <td class="odds ${s.roi > 0 ? "green" : s.roi < 0 ? "red" : ""}">${esc(signedPct(s.roi))}</td>
    </tr>`;
  }

  function render(root) {
    if (!root) return;
    let tickets = [];
    try {
      const st = typeof Portfolio !== "undefined" ? Portfolio.get() : null;
      tickets = st && Array.isArray(st.tickets) ? st.tickets : [];
    } catch (e) { tickets = []; }
    const stats = JournalCore.computeStats(tickets);
    const head = `<div class="jr-intro"><p>${esc(T("view.intro"))}</p><p class="t-meta">${esc(T("view.scope"))}</p></div>`;
    if (!stats.entries.length) {
      root.innerHTML = `${head}<div class="panel jr-empty"><p>${esc(T("view.empty"))}</p></div>`;
      return;
    }
    if (filterTag && !stats.byTag.some((r) => r.tag === filterTag)) filterTag = "";

    const hints = stats.hints.map((h) => `
      <div class="jr-hint ${h.kind}">${esc(TF(h.kind === "good" ? "view.hintGood" : "view.hintBad", { tag: tagLabel(h.tag), roi: signedPct(h.roi), n: h.settled }))}</div>`).join("");
    const statsPanel = `
      <div class="panel">
        <h3>${esc(T("view.statsTitle"))}</h3>
        <div class="tl-table-wrap">
          <table class="ticket-table jr-table">
            <thead><tr><th>${esc(T("view.reason"))}</th><th>${esc(T("view.settled"))}</th><th>${esc(T("view.winRate"))}</th><th>${esc(T("view.roi"))}</th></tr></thead>
            <tbody>
              ${stats.byTag.map((r) => statsRow(tagLabel(r.tag), r, false)).join("")}
              ${statsRow(T("view.all"), stats.all, true)}
            </tbody>
          </table>
        </div>
        ${hints || `<p class="t-meta jr-small">${esc(T("view.smallSample"))}</p>`}
        <p class="tl-explain">${esc(T("view.statsNote"))}</p>
      </div>`;

    const filtered = stats.entries.filter((t) => !filterTag || (t.noteTags || []).includes(filterTag));
    const filters = `
      <div class="news-filters" role="group" aria-label="${esc(T("view.filterLabel"))}">
        <button type="button" data-jr-filter="" aria-pressed="${!filterTag}">${esc(T("view.filterAll"))}</button>
        ${stats.byTag.map((r) => `<button type="button" data-jr-filter="${r.tag}" aria-pressed="${filterTag === r.tag}">${esc(tagLabel(r.tag))} <small>${r.tips}</small></button>`).join("")}
      </div>`;
    const list = filtered.length
      ? filtered.slice(0, LIST_LIMIT).map(entryHtml).join("") + (filtered.length > LIST_LIMIT ? `<p class="t-meta">${esc(TF("view.more", { n: LIST_LIMIT }))}</p>` : "")
      : `<p class="t-meta">${esc(T("view.noMatch"))}</p>`;

    root.innerHTML = `${head}
      <div class="jr-layout">
        ${statsPanel}
        <div class="panel">
          <h3>${esc(T("view.listTitle"))}</h3>
          ${filters}
          <div class="jr-list">${list}</div>
        </div>
      </div>`;
  }

  window.FundlyJournal = { TAGS, core: JournalCore, slipFieldsHtml, draft: getDraft, clearDraft, render, tagLabel };
})();
