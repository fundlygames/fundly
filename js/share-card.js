/* Fundly — karta výsledků ke sdílení (Instagram Story 1080×1920, PNG z canvasu v prohlížeči).
   Druhy karet:
     • "progress" — aktuální stav (Fáze 1: x % cíle / Fáze 1 splněna / Partner), tlačítko v Přehledu
     • "month"    — měsíční přehled (js/recap.js, Výkon → Měsíc)
     • "badge"    — odemčený odznak (Profil → Odznaky, klik na odemčený odznak)
   Na kartě jsou jen PROCENTA a počty (ROI, úspěšnost, tipy, série disciplíny) — žádné dolarové
   částky, ať karta nepůsobí jako „výhra". Patička vždy uvádí simulovaný kapitál a 18+.
   Texty NA kartě: česky (cs/sk) nebo anglicky (ostatní) — jako certifikát. Texty UI: jmenný prostor "share".
   Spouštění: libovolný prvek s data-share="progress|month|badge" (+ data-badge-key, data-badge-name). */
(function () {
  "use strict";
  if (!window.FUNDLY_I18N) return;

  const W = 1080, H = 1920;
  const ACCENT = "#14f195";
  const FONT = '"Hanken Grotesk", "Google Sans", system-ui, -apple-system, sans-serif';

  FUNDLY_I18N.extend("en", { share: {
    title: "Share your result",
    preparing: "Preparing the image…",
    share: "Share", download: "Download image", close: "Close",
    hint: "Instagram Story format (1080 × 1920). The card shows only percentages and counts — no dollar amounts.",
    err: "The image could not be created. Try again.",
    btn: "Share",
    badgeHint: "Click an unlocked badge to share it.",
  } });
  FUNDLY_I18N.extend("cs", { share: {
    title: "Sdílet výsledek",
    preparing: "Připravuji obrázek…",
    share: "Sdílet", download: "Stáhnout obrázek", close: "Zavřít",
    hint: "Formát Instagram Story (1080 × 1920). Karta ukazuje jen procenta a počty — žádné částky v dolarech.",
    err: "Obrázek se nepodařilo vytvořit. Zkus to znovu.",
    btn: "Sdílet",
    badgeHint: "Kliknutím na odemčený odznak ho můžeš sdílet.",
  } });

  // statické data-i18n="share.*" (tlačítka v dashboard.html) se přeložily dřív, než slovník existoval
  if (FUNDLY_I18N.refresh) FUNDLY_I18N.refresh();

  // texty na kartě (nezávisle na jazyku UI: cs pro cs/sk, jinak en)
  const PRINT = {
    en: {
      phaseProgress: "Phase {n}: {pct} % of target",
      phasePassed: "Phase {n} passed ✓",
      partner: "I'm a Fundly Partner",
      nowPhase2: "Now in Phase 2 · {pct} % of target",
      awaiting: "Awaiting approval to move on",
      kickerPhase: "PHASE {n} · {pkg}",
      kickerPartner: "PARTNER · {pkg}",
      kickerMonth: "MY MONTH ON FUNDLY",
      kickerBadge: "NEW BADGE UNLOCKED",
      monthTitle: "{month} in numbers",
      roi: "ROI", roiPhase: "ROI this phase",
      tips: "tips", winRate: "win rate", streak: "discipline streak", days: "{n} d",
      bestSport: "Best sport: {sport}",
      tagline: "Testing my sports predictions on simulated capital.",
      legal: "Simulated capital · no own money on tips · 18+",
    },
    cs: {
      phaseProgress: "Fáze {n}: {pct} % cíle",
      phasePassed: "Fáze {n} splněna ✓",
      partner: "Jsem Fundly Partner",
      nowPhase2: "Teď Fáze 2 · {pct} % cíle",
      awaiting: "Čekám na schválení postupu",
      kickerPhase: "FÁZE {n} · {pkg}",
      kickerPartner: "PARTNER · {pkg}",
      kickerMonth: "MŮJ MĚSÍC NA FUNDLY",
      kickerBadge: "NOVÝ ODZNAK",
      monthTitle: "{month} v číslech",
      roi: "ROI", roiPhase: "ROI v této fázi",
      tips: "tipy", winRate: "úspěšnost", streak: "série disciplíny", days: "{n} d",
      bestSport: "Nejlepší sport: {sport}",
      tagline: "Testuji své sportovní predikce na simulovaném kapitálu.",
      legal: "Simulovaný kapitál · do tipů nevkládám vlastní peníze · 18+",
    },
  };

  const I = window.FUNDLY_I18N;
  const tr = (k) => I.t(k);
  const uiLang = () => (typeof I.getLang === "function" ? I.getLang() : "en");
  const cardLang = () => (uiLang() === "cs" || uiLang() === "sk" ? "cs" : "en");
  const P = (k, vars) => String(PRINT[cardLang()][k]).replace(/\{(\w+)\}/g, (m, x) => (vars && vars[x] !== undefined ? vars[x] : m));
  const escH = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cardLocale = () => (cardLang() === "cs" ? "cs-CZ" : "en-US");
  const sep = () => (cardLang() === "cs" ? " %" : "%");
  const fmt = (v, d) => Number(v).toLocaleString(cardLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  const signedPct = (r, d = 1) => {
    if (r === null || r === undefined || !Number.isFinite(r)) return "–";
    const v = Number((r * 100).toFixed(d));
    return (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), d) + sep();
  };
  const plainPct = (r) => (r === null || r === undefined ? "–" : fmt(r * 100, 0) + sep());

  // ------------------------------------------------------------------
  // data karet
  // ------------------------------------------------------------------
  const SETTLED = { won: 1, lost: 1, push: 1, cashedout: 1 };
  function perf(tickets) {
    let won = 0, lost = 0, staked = 0, net = 0;
    for (const t of tickets) {
      if (!SETTLED[t.status] || t.voidReason) continue;
      staked += Number(t.stake) || 0;
      net += (Number(t.payout) || 0) - (Number(t.stake) || 0);
      if (t.status === "won") won++;
      if (t.status === "lost") lost++;
    }
    return { roi: staked > 0 ? net / staked : null, winRate: won + lost ? won / (won + lost) : null };
  }
  function streakOf(state) {
    const core = window.FundlyRecap && window.FundlyRecap.core;
    return core ? core.disciplineStreak(state.tickets || [], state.cap).current : 0;
  }

  function progressSpec() {
    const state = typeof Portfolio !== "undefined" ? Portfolio.get() : null;
    if (!state) return null;
    const all = state.tickets || [];
    const pkg = String(state.packageName || "").toUpperCase();
    const target = Portfolio.phaseTarget(state);
    const profit = state.balance - state.phaseBaseline;
    const pct = target > 0 ? Math.max(0, Math.min(100, Math.round((profit / target) * 100))) : 100;
    const since = new Date(state.phaseStartedAt).getTime();
    const phaseTix = all.filter((t) => new Date(t.placedAt).getTime() >= since);
    let kicker, headline, sub = "", scope = all, roiLabel = P("roi");
    if (state.phase === "funded") {
      kicker = P("kickerPartner", { pkg });
      headline = P("partner");
    } else if (state.pendingPhase) {
      kicker = P("kickerPhase", { n: state.phase, pkg });
      headline = P("phasePassed", { n: state.phase });
      sub = P("awaiting");
      scope = phaseTix; roiLabel = P("roiPhase");
    } else if (state.phase === 2) {
      kicker = P("kickerPhase", { n: 2, pkg });
      headline = P("phasePassed", { n: 1 });
      sub = P("nowPhase2", { pct });
    } else {
      kicker = P("kickerPhase", { n: state.phase, pkg });
      headline = P("phaseProgress", { n: state.phase, pct });
      scope = phaseTix; roiLabel = P("roiPhase");
    }
    const p = perf(scope);
    return {
      kind: "progress", kicker, headline, sub,
      metric: signedPct(p.roi), metricLabel: roiLabel, metricPositive: (p.roi || 0) >= 0,
      stats: [
        [String(scope.length), P("tips")],
        [plainPct(p.winRate), P("winRate")],
        [P("days", { n: streakOf(state) }), P("streak")],
      ],
      file: "fundly-progress",
    };
  }

  function monthSpec() {
    const r = window.FundlyRecap && window.FundlyRecap.monthForShare();
    if (!r) return null;
    const m = r.month;
    // název měsíce na kartě v jazyce karty
    const [y, mo] = m.key.split("-").map(Number);
    let name = new Date(y, mo - 1, 1).toLocaleDateString(cardLocale(), { month: "long" });
    name = name.charAt(0).toUpperCase() + name.slice(1);
    const sport = m.bestSport && typeof sportName === "function" ? sportName(m.bestSport.key, m.bestSport.key) : null;
    return {
      kind: "month",
      kicker: P("kickerMonth"),
      headline: P("monthTitle", { month: name }),
      sub: sport ? P("bestSport", { sport }) : "",
      metric: signedPct(m.roi), metricLabel: P("roi"), metricPositive: m.roi >= 0,
      stats: [
        [String(m.tips), P("tips")],
        [plainPct(m.winRate), P("winRate")],
        [P("days", { n: r.streak.current }), P("streak")],
      ],
      file: `fundly-${m.key}`,
    };
  }

  function badgeSpec(key, name) {
    const state = typeof Portfolio !== "undefined" ? Portfolio.get() : null;
    const p = state ? perf(state.tickets || []) : { roi: null, winRate: null };
    return {
      kind: "badge",
      kicker: P("kickerBadge"),
      headline: name || "",
      badgeImg: `assets/badges/${key}.png`,
      stats: state ? [
        [String((state.tickets || []).length), P("tips")],
        [plainPct(p.winRate), P("winRate")],
        [P("days", { n: streakOf(state) }), P("streak")],
      ] : [],
      file: `fundly-badge-${key}`,
    };
  }

  // ------------------------------------------------------------------
  // canvas
  // ------------------------------------------------------------------
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  let logoP = null;
  function loadLogo() {
    // stejně jako certifikát: assets/logo.png má zapečenou šedou šachovnici → ponechat jen zelenou značku
    if (!logoP) logoP = loadImg("assets/logo.png").then((img) => {
      if (!img) return null;
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext("2d");
        x.drawImage(img, 0, 0);
        const px = x.getImageData(0, 0, c.width, c.height);
        for (let i = 0; i < px.data.length; i += 4) if (px.data[i + 1] - px.data[i] < 40) px.data[i + 3] = 0;
        x.putImageData(px, 0, 0);
        return c;
      } catch (e) { return img; }
    });
    return logoP;
  }
  async function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return;
    try { await Promise.all([500, 700, 800].map((w) => document.fonts.load(`${w} 40px "Hanken Grotesk"`, "Fundly ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ 0123456789 %+−"))); } catch (e) { /* */ }
  }
  const font = (w, px) => `${w} ${px}px ${FONT}`;
  function fit(ctx, text, weight, max, min, width) {
    let s = max;
    for (; s > min; s -= 4) { ctx.font = font(weight, s); if (ctx.measureText(text).width <= width) break; }
    ctx.font = font(weight, s);
    return s;
  }
  function wrap(ctx, text, width) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > width && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function spaced(ctx, text, cx, y, spacing) {
    // písmo s prostrkáním (ctx.letterSpacing není všude) — ruční vykreslení po znacích
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let x = cx - total / 2;
    ctx.textAlign = "left";
    chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
    ctx.textAlign = "center";
  }

  async function renderCard(spec) {
    await ensureFonts();
    const [logo, badge] = await Promise.all([loadLogo(), spec.badgeImg ? loadImg(spec.badgeImg) : Promise.resolve(null)]);
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // pozadí
    ctx.fillStyle = "#050607";
    ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(540, 760, 40, 540, 760, 900);
    g.addColorStop(0, "rgba(20,241,149,0.22)");
    g.addColorStop(0.5, "rgba(20,241,149,0.06)");
    g.addColorStop(1, "rgba(20,241,149,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(980, 1800, 10, 980, 1800, 700);
    g.addColorStop(0, "rgba(20,241,149,0.10)");
    g.addColorStop(1, "rgba(20,241,149,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,255,255,0.035)";
    ctx.lineWidth = 1;
    for (let x = 60; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke(); }
    for (let y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke(); }

    // logo + název (bezpečná zóna Story: obsah mezi y ≈ 250 a 1650)
    ctx.font = font(800, 64);
    const wordW = ctx.measureText("Fundly").width;
    const logoS = 92, gap = 18;
    const groupW = (logo ? logoS + gap : 0) + wordW;
    const gx = (W - groupW) / 2;
    if (logo) ctx.drawImage(logo, gx, 262, logoS, logoS);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.fillText("Fundly", gx + (logo ? logoS + gap : 0), 330);
    ctx.textAlign = "center";

    // kicker
    ctx.fillStyle = ACCENT;
    ctx.font = font(700, 32);
    spaced(ctx, spec.kicker, W / 2, 500, 5);

    // nadpis (max. 2 řádky)
    let size = fit(ctx, spec.headline, 800, 96, 64, 940);
    let lines = wrap(ctx, spec.headline, 940);
    if (lines.length > 2) { size = 64; ctx.font = font(800, size); lines = wrap(ctx, spec.headline, 940).slice(0, 2); }
    ctx.fillStyle = "#ffffff";
    let y = 620;
    lines.forEach((l) => { ctx.fillText(l, W / 2, y); y += size * 1.12; });
    if (spec.sub) {
      ctx.fillStyle = "#a9adb8";
      fit(ctx, spec.sub, 500, 42, 28, 940);
      ctx.fillText(spec.sub, W / 2, y + 6);
      y += 50;
    }

    // hlavní číslo / odznak
    if (spec.kind === "badge" && badge) {
      const s = 460;
      ctx.save();
      ctx.shadowColor = "rgba(20,241,149,0.55)";
      ctx.shadowBlur = 80;
      ctx.drawImage(badge, (W - s) / 2, Math.max(y + 40, 760), s, s);
      ctx.restore();
    } else if (spec.metric) {
      const my = Math.max(y + 300, 1030);
      ctx.fillStyle = spec.metricPositive ? ACCENT : "#ffffff";
      ctx.save();
      if (spec.metricPositive) { ctx.shadowColor = "rgba(20,241,149,0.45)"; ctx.shadowBlur = 60; }
      fit(ctx, spec.metric, 800, 250, 140, 980);
      ctx.fillText(spec.metric, W / 2, my);
      ctx.restore();
      ctx.fillStyle = "#a9adb8";
      ctx.font = font(600, 40);
      ctx.fillText(spec.metricLabel, W / 2, my + 100);
    }

    // tři statistiky
    if (spec.stats && spec.stats.length) {
      const n = spec.stats.length, bw = 300, bh = 190, bg = 30;
      const sx = (W - (n * bw + (n - 1) * bg)) / 2, sy = 1270;
      spec.stats.forEach(([val, lbl], i) => {
        const x = sx + i * (bw + bg);
        rrect(ctx, x, sy, bw, bh, 28);
        ctx.fillStyle = "rgba(255,255,255,0.045)";
        ctx.fill();
        ctx.strokeStyle = "rgba(20,241,149,0.28)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        fit(ctx, val, 800, 76, 40, bw - 40);
        ctx.fillText(val, x + bw / 2, sy + 98);
        ctx.fillStyle = "#a9adb8";
        fit(ctx, lbl, 600, 30, 20, bw - 30);
        ctx.fillText(lbl, x + bw / 2, sy + 150);
      });
    }

    // patička
    ctx.fillStyle = "#d4d6dc";
    fit(ctx, P("tagline"), 500, 36, 26, 960);
    ctx.fillText(P("tagline"), W / 2, 1560);
    ctx.fillStyle = ACCENT;
    ctx.font = font(800, 50);
    ctx.fillText("fundly.games", W / 2, 1632);
    ctx.fillStyle = "#7d818c";
    fit(ctx, P("legal"), 500, 24, 18, 960);
    ctx.fillText(P("legal"), W / 2, 1682);
    return c;
  }

  // ------------------------------------------------------------------
  // modal
  // ------------------------------------------------------------------
  let modal = null;
  let current = null; // { blob, url, file }
  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "modal-backdrop share-backdrop";
    modal.hidden = true;
    modal.innerHTML = `<div class="modal share-modal" role="dialog" aria-modal="true" aria-labelledby="shareModalTitle">
      <button type="button" class="modal-close" data-share-close><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      <h2 class="share-modal-title" id="shareModalTitle"></h2>
      <div class="share-preview"></div>
      <div class="share-actions">
        <button type="button" class="btn btn-primary" data-share-act="share"></button>
        <button type="button" class="btn btn-ghost" data-share-act="download"></button>
      </div>
      <p class="share-hint"></p>
    </div>`;
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-share-close]")) close();
      const act = e.target.closest && e.target.closest("[data-share-act]");
      if (act) (act.dataset.shareAct === "share" ? doShare : doDownload)();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal && !modal.hidden) close(); });
    document.body.appendChild(modal);
    return modal;
  }
  function close() {
    if (!modal) return;
    modal.hidden = true;
    if (current && current.url) URL.revokeObjectURL(current.url);
    current = null;
  }
  function canShareFiles() {
    try {
      const f = new File([new Blob([""], { type: "image/png" })], "x.png", { type: "image/png" });
      return !!(navigator.canShare && navigator.canShare({ files: [f] }));
    } catch (e) { return false; }
  }

  async function open(spec) {
    if (!spec) return;
    ensureModal();
    modal.querySelector(".share-modal-title").textContent = tr("share.title");
    modal.querySelector(".modal-close").setAttribute("aria-label", tr("share.close"));
    modal.querySelector(".share-hint").textContent = tr("share.hint");
    const shareBtn = modal.querySelector('[data-share-act="share"]');
    shareBtn.textContent = tr("share.share");
    shareBtn.hidden = !canShareFiles();
    modal.querySelector('[data-share-act="download"]').textContent = tr("share.download");
    const box = modal.querySelector(".share-preview");
    box.innerHTML = `<div class="share-loading">${escH(tr("share.preparing"))}</div>`;
    modal.hidden = false;
    const token = {};
    current = token;
    try {
      const canvas = await renderCard(spec);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (current !== token) return;
      token.blob = blob;
      token.file = `${spec.file}.png`;
      token.url = URL.createObjectURL(blob);
      box.innerHTML = `<img src="${token.url}" alt="" width="1080" height="1920" />`;
    } catch (e) {
      if (current === token) box.innerHTML = `<div class="share-loading">${escH(tr("share.err"))}</div>`;
    }
  }
  async function doShare() {
    if (!current || !current.blob) return;
    try {
      const file = new File([current.blob], current.file, { type: "image/png" });
      await navigator.share({ files: [file], title: "Fundly" });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      doDownload();
    }
  }
  function doDownload() {
    if (!current || !current.blob) return;
    const a = document.createElement("a");
    a.href = current.url;
    a.download = current.file;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  document.addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("[data-share]");
    if (!el) return;
    e.preventDefault();
    const kind = el.dataset.share;
    if (kind === "progress") open(progressSpec());
    else if (kind === "month") open(monthSpec());
    else if (kind === "badge") open(badgeSpec(el.dataset.badgeKey, el.dataset.badgeName));
  });

  window.FundlyShare = { open, renderCard, progressSpec, monthSpec, badgeSpec };
})();
