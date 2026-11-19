/* Fundly — certifikát "Fundly Certified Analyst" v dashboardu.
   Vydává se po splnění OBOU hodnoticích fází (challenge_accounts.phase2_completed_at),
   nevyžaduje aktivační poplatek ani funded stav. Jeden certifikát na účet.

   • panel "Certifikáty" v Profilu (#certPanel) + karta v Přehledu (#certPromo)
   • vystavení: edge funkce certificate-issue (ověří účet + fázi, spočítá statistiky na serveru)
   • výstupy generované v prohlížeči: PNG 1080×1350 (Instagram) z canvasu a PDF A4 na šířku
     (jsPDF z cdnjs, načte se až po kliknutí na "Stáhnout PDF")
   • sdílení: LinkedIn (odkaz na ověřovací stránku certificate.html?id=…), kopírování odkazu
   Texty UI: FUNDLY_I18N.extend (jmenný prostor "cert"); texty NA certifikátu jsou vždy
   česky (cs/sk) nebo anglicky (ostatní jazyky) — viz PRINT. Nezasahuje do js/dashboard.js. */
(function () {
  "use strict";
  if (!window.FUNDLY_I18N) return;

  const SITE = "https://fundly.games";
  const JSPDF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  const FONT = '"Hanken Grotesk", "Google Sans", system-ui, -apple-system, sans-serif';
  const ACCENT = "#14f195";

  FUNDLY_I18N.extend("en", { cert: {
    panelTitle: "Certificates",
    panelIntro: "Pass both evaluation phases (Phase 1 and Phase 2) to earn the Fundly Certified Analyst certificate — download it or share it on LinkedIn and Instagram.",
    empty: "No certificate yet — it unlocks once you pass Phase 2.",
    itemTitle: "Fundly Certified Analyst",
    itemMeta: "{pkg} · {capital} · passed {date}",
    notIssued: "Ready to create",
    open: "Open",
    cardTitle: "Your certificate is ready 🎓",
    cardBody: "You passed both evaluation phases. Download your Fundly Certified Analyst certificate and share your result.",
    cardBtn: "View certificate",
    hide: "Hide",
    close: "Close",
    nameTitle: "Name on the certificate",
    nameIntro: "Enter the name to print on your certificate. It will be shown publicly on the verification page and can't be changed later.",
    nameLabel: "Name",
    namePh: "e.g. Alex Morgan",
    create: "Create certificate",
    creating: "Creating…",
    preparing: "Preparing your certificate…",
    dlPng: "Download for Instagram",
    dlPdf: "Download PDF",
    linkedin: "Share on LinkedIn",
    copy: "Copy link",
    copied: "Link copied",
    verifyLabel: "Verification link",
    previewAlt: "Fundly Certified Analyst certificate",
    errGeneric: "Something went wrong. Please try again.",
    errName: "That name can't be used — enter another one (2–40 characters, no e-mail address).",
    errSignIn: "Please sign in again.",
    errPdf: "The PDF could not be created. Try again, or download the image instead.",
    errRevoked: "This certificate has been revoked.",
  } });
  FUNDLY_I18N.extend("cs", { cert: {
    panelTitle: "Certifikáty",
    panelIntro: "Splň obě hodnoticí fáze (Fázi 1 i Fázi 2) a získej certifikát Fundly Certified Analyst — stáhni si ho nebo ho sdílej na LinkedInu a Instagramu.",
    empty: "Zatím žádný certifikát — odemkne se po splnění Fáze 2.",
    itemTitle: "Fundly Certified Analyst",
    itemMeta: "{pkg} · {capital} · splněno {date}",
    notIssued: "Připraveno k vystavení",
    open: "Otevřít",
    cardTitle: "Tvůj certifikát je připravený 🎓",
    cardBody: "Obě hodnoticí fáze máš splněné. Stáhni si certifikát Fundly Certified Analyst a pochlub se svým výsledkem.",
    cardBtn: "Zobrazit certifikát",
    hide: "Skrýt",
    close: "Zavřít",
    nameTitle: "Jméno na certifikátu",
    nameIntro: "Zadej jméno, které se vytiskne na certifikát. Bude veřejně vidět na ověřovací stránce a později už ho nepůjde změnit.",
    nameLabel: "Jméno",
    namePh: "např. Jan Novák",
    create: "Vystavit certifikát",
    creating: "Vystavuji…",
    preparing: "Připravuji certifikát…",
    dlPng: "Stáhnout pro Instagram",
    dlPdf: "Stáhnout PDF",
    linkedin: "Sdílet na LinkedInu",
    copy: "Kopírovat odkaz",
    copied: "Odkaz zkopírován",
    verifyLabel: "Ověřovací odkaz",
    previewAlt: "Certifikát Fundly Certified Analyst",
    errGeneric: "Něco se nepovedlo. Zkus to prosím znovu.",
    errName: "Toto jméno nejde použít — zadej jiné (2–40 znaků, bez e-mailové adresy).",
    errSignIn: "Přihlas se prosím znovu.",
    errPdf: "PDF se nepodařilo vytvořit. Zkus to znovu, nebo si stáhni obrázek.",
    errRevoked: "Tento certifikát byl zrušen.",
  } });

  // Texty tištěné na certifikát (obrázek / PDF)
  const PRINT = {
    en: {
      eyebrow: "CERTIFICATE OF ACHIEVEMENT",
      title: "Fundly Certified Analyst",
      awarded: "This certificate is awarded to",
      body: "for successfully passing both evaluation phases of the Fundly Challenge (Phase 1 and Phase 2) with disciplined risk management.",
      badge: "Phase 1 + Phase 2 passed",
      tips: "Tips", winRate: "Win rate", profit: "Profit (% of capital)", avgOdds: "Average odds",
      phaseLine: "Phase {n}: {tips} tips · {profit}",
      package: "Package", capital: "Simulated capital", date: "Date passed", id: "Certificate ID",
      verify: "Verify at",
      disclaimer: "Simulated evaluation using virtual credits with no monetary value.",
    },
    cs: {
      eyebrow: "CERTIFIKÁT O ÚSPĚCHU",
      title: "Fundly Certified Analyst",
      awarded: "Tento certifikát získává",
      body: "za úspěšné splnění obou hodnoticích fází výzvy Fundly Challenge (Fáze 1 a Fáze 2) s disciplinovaným řízením rizika.",
      badge: "Fáze 1 + Fáze 2 splněny",
      tips: "Tipy", winRate: "Úspěšnost", profit: "Zisk (% kapitálu)", avgOdds: "Průměrný kurz",
      phaseLine: "Fáze {n}: tipy {tips} · {profit}",
      package: "Balíček", capital: "Simulovaný kapitál", date: "Datum splnění", id: "ID certifikátu",
      verify: "Ověření:",
      disclaimer: "Simulované hodnocení s virtuálními kredity bez peněžní hodnoty.",
    },
  };

  const t = (k, vars) => FUNDLY_I18N.tf("cert." + k, vars);
  function certLang() {
    const l = FUNDLY_I18N.getLang();
    return l === "cs" || l === "sk" ? "cs" : "en";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function verifyUrl(id) { return `${SITE}/certificate?id=${encodeURIComponent(id)}`; }

  // ---------- formátování (cs: 10 000 / 12,4 %; en: 10,000 / 12.4 %) ----------
  function fmtNum(n, digits, lang) {
    return new Intl.NumberFormat(lang === "cs" ? "cs-CZ" : "en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
      .format(Number(n) || 0)
      .replace(/[   ]/g, " ");
  }
  const fmtMoney = (n, lang) => "$" + fmtNum(n, 0, lang);
  const fmtPct = (n, lang, sign) => (sign && Number(n) > 0 ? "+" : "") + fmtNum(n, 1, lang) + " %";
  function fmtDate(iso, lang) {
    if (!iso) return "–";
    try {
      return new Date(iso).toLocaleDateString(lang === "cs" ? "cs-CZ" : "en-US", { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return String(iso).slice(0, 10); }
  }
  function pkgName(key) {
    const list = typeof PACKAGES !== "undefined" && Array.isArray(PACKAGES) ? PACKAGES : [];
    const p = list.find((x) => x.key === key);
    return p ? p.name : (key ? String(key).charAt(0).toUpperCase() + String(key).slice(1) : "–");
  }

  // ---------- data pro vykreslení ----------
  function certData(cert, lang) {
    const s = cert.stats || {};
    return {
      lang,
      id: cert.id,
      name: cert.display_name,
      pkg: pkgName(cert.package_key),
      capital: Number(cert.capital) || 0,
      passedAt: cert.passed_at || cert.issued_at,
      stats: s,
      url: verifyUrl(cert.id),
    };
  }

  // =====================================================================
  // Canvas renderer
  // =====================================================================
  let logoPromise = null;
  function loadLogo() {
    if (!logoPromise) {
      logoPromise = new Promise((resolve) => {
        const img = new Image();
        // nové logo (zeleno-fialový přechod) má čistě průhledné pozadí → kreslí se tak, jak je
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = "assets/logo.png";
      });
    }
    return logoPromise;
  }
  async function ensureFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const sample = "Fundly ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ áčďéěíňóřšťúůýž 0123456789 $%";
    try {
      await Promise.all([500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "Hanken Grotesk"`, sample)));
    } catch (e) { /* fallback font */ }
  }

  const font = (w, px) => `${w} ${px}px ${FONT}`;
  function fitSize(ctx, text, weight, max, min, width) {
    let size = max;
    ctx.font = font(weight, size);
    while (size > min && ctx.measureText(text).width > width) {
      size -= 2;
      ctx.font = font(weight, size);
    }
    return size;
  }
  function wrap(ctx, text, width) {
    const words = String(text).split(/\s+/);
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
  // text s prostrkáním (ctx.letterSpacing není všude), zarovnaný na střed cx
  function spaced(ctx, text, cx, y, spacing) {
    const chars = Array.from(text);
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let x = cx - total / 2;
    const prev = ctx.textAlign;
    ctx.textAlign = "left";
    chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
    ctx.textAlign = prev;
  }

  // Rozvržení: P = Instagram 1080×1350, L = A4 na šířku (základ 1123×794, kreslí se 2.5×)
  const LAYOUTS = {
    portrait: {
      W: 1080, H: 1350, scale: 1, pad: 84, frame: 28,
      header: 96, logo: 52, word: 38, chip: 20,
      eyebrow: [236, 21, 6], title: [306, 66], rule: 340, awarded: [404, 28], name: [492, 88, 46, 900], body: [566, 28, 40, 860],
      stats: { y: 676, h: 132, cols: 2, gap: 20, w: 900, val: 54, lbl: 20 },
      phases: [1004, 21], meta: { y: 1088, cols: 3, lbl: 18, val: 26, gap: 34, w: 900 },
      footer: [1230, 21], disclaimer: [1272, 16],
      seal: null,
    },
    landscape: {
      W: 1123, H: 794, scale: 2.5, pad: 60, frame: 20,
      header: 62, logo: 34, word: 25, chip: 13,
      eyebrow: [140, 13, 5], title: [190, 44], rule: 214, awarded: [256, 17], name: [318, 58, 30, 760], body: [362, 17, 25, 760],
      stats: { y: 432, h: 88, cols: 4, gap: 14, w: 900, val: 32, lbl: 13 },
      phases: [552, 13], meta: { y: 590, cols: 4, lbl: 11.5, val: 16, gap: 22, w: 900 },
      footer: [702, 13], disclaimer: [730, 10.5],
      seal: { x: 1123 - 118, y: 794 - 126, r: 50 },
    },
  };

  async function renderCanvas(d, kind) {
    const L = LAYOUTS[kind];
    const P = PRINT[d.lang] || PRINT.en;
    await ensureFonts();
    const logo = await loadLogo();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(L.W * L.scale);
    canvas.height = Math.round(L.H * L.scale);
    const ctx = canvas.getContext("2d");
    ctx.scale(L.scale, L.scale);
    const { W, H } = L;
    const cx = W / 2;

    // pozadí + záře
    ctx.fillStyle = "#020204";
    ctx.fillRect(0, 0, W, H);
    let g = ctx.createRadialGradient(W * 0.92, -H * 0.04, 0, W * 0.92, -H * 0.04, W * 0.75);
    g.addColorStop(0, "rgba(20,241,149,0.20)");
    g.addColorStop(1, "rgba(20,241,149,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    g = ctx.createRadialGradient(W * 0.04, H * 1.04, 0, W * 0.04, H * 1.04, W * 0.8);
    g.addColorStop(0, "rgba(153,69,255,0.18)");
    g.addColorStop(1, "rgba(153,69,255,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // jemná tečková mřížka
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    const step = kind === "portrait" ? 36 : 26;
    for (let y = step; y < H; y += step) for (let x = step; x < W; x += step) ctx.fillRect(x, y, 1.2, 1.2);

    // rámeček
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    rrect(ctx, L.frame, L.frame, W - 2 * L.frame, H - 2 * L.frame, 22);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(20,241,149,0.28)";
    rrect(ctx, L.frame + 8, L.frame + 8, W - 2 * L.frame - 16, H - 2 * L.frame - 16, 16);
    ctx.stroke();

    // hlavička: logo + wordmark vlevo, štítek vpravo
    ctx.textBaseline = "middle";
    if (logo) ctx.drawImage(logo, L.pad, L.header - L.logo / 2, L.logo, L.logo);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(800, L.word);
    ctx.textAlign = "left";
    ctx.fillText("fundly", L.pad + L.logo + L.logo * 0.18, L.header + 1);
    ctx.font = font(700, L.chip);
    const chipW = ctx.measureText(P.badge).width + L.chip * 1.6;
    const chipH = L.chip * 2.1;
    const chipX = W - L.pad - chipW;
    ctx.fillStyle = "rgba(20,241,149,0.12)";
    rrect(ctx, chipX, L.header - chipH / 2, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20,241,149,0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = ACCENT;
    ctx.textAlign = "center";
    ctx.fillText(P.badge, chipX + chipW / 2, L.header + 1);

    // nadpisy
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = ACCENT;
    ctx.font = font(700, L.eyebrow[1]);
    spaced(ctx, P.eyebrow, cx, L.eyebrow[0], L.eyebrow[2]);
    ctx.fillStyle = "#ffffff";
    fitSize(ctx, P.title, 800, L.title[1], 24, W - 2 * L.pad - 40);
    ctx.fillText(P.title, cx, L.title[0]);
    const rg = ctx.createLinearGradient(cx - 70, 0, cx + 70, 0);
    rg.addColorStop(0, "rgba(20,241,149,0)");
    rg.addColorStop(0.5, "rgba(20,241,149,0.9)");
    rg.addColorStop(1, "rgba(20,241,149,0)");
    ctx.fillStyle = rg;
    ctx.fillRect(cx - 70, L.rule, 140, 2);

    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = font(500, L.awarded[1]);
    ctx.fillText(P.awarded, cx, L.awarded[0]);

    // jméno
    const [ny, nmax, nmin, nw] = L.name;
    fitSize(ctx, d.name, 800, nmax, nmin, nw);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(20,241,149,0.35)";
    ctx.shadowBlur = 24;
    ctx.fillText(d.name, cx, ny);
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // text
    const [by, bsize, blh, bw] = L.body;
    ctx.font = font(500, bsize);
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    wrap(ctx, P.body, bw).forEach((line, i) => ctx.fillText(line, cx, by + i * blh));

    // statistiky
    const s = d.stats || {};
    const stats = [
      [P.tips, fmtNum(s.tips || 0, 0, d.lang), false],
      [P.winRate, s.winRate == null ? "–" : fmtPct(s.winRate, d.lang), false],
      [P.profit, fmtPct(s.profitPct || 0, d.lang, true), true],
      [P.avgOdds, s.avgOdds == null ? "–" : fmtNum(s.avgOdds, 2, d.lang), false],
    ];
    const S = L.stats;
    const cardW = (S.w - S.gap * (S.cols - 1)) / S.cols;
    const sx0 = cx - S.w / 2;
    stats.forEach(([lbl, val, accent], i) => {
      const col = i % S.cols;
      const row = Math.floor(i / S.cols);
      const x = sx0 + col * (cardW + S.gap);
      const y = S.y + row * (S.h + S.gap);
      ctx.fillStyle = "rgba(255,255,255,0.045)";
      rrect(ctx, x, y, cardW, S.h, 14);
      ctx.fill();
      ctx.strokeStyle = accent ? "rgba(20,241,149,0.40)" : "rgba(255,255,255,0.09)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = accent ? ACCENT : "#ffffff";
      fitSize(ctx, val, 800, S.val, 14, cardW - 24);
      ctx.fillText(val, x + cardW / 2, y + S.h * 0.52);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      fitSize(ctx, lbl, 600, S.lbl, 8, cardW - 20);
      ctx.fillText(lbl, x + cardW / 2, y + S.h * 0.80);
    });

    // výsledek po fázích
    if (s.phase1 && s.phase2) {
      const line = [1, 2].map((n) => {
        const p = s["phase" + n];
        return P.phaseLine.replace("{n}", n).replace("{tips}", fmtNum(p.tips || 0, 0, d.lang)).replace("{profit}", fmtPct(p.profitPct || 0, d.lang, true));
      }).join("     ·     ");
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = font(600, L.phases[1]);
      ctx.fillText(line, cx, L.phases[0]);
    }

    // meta: balíček / kapitál / datum (/ ID na šířku)
    const M = L.meta;
    const meta = [
      [P.package, d.pkg],
      [P.capital, fmtMoney(d.capital, d.lang)],
      [P.date, fmtDate(d.passedAt, d.lang)],
    ];
    if (M.cols === 4) meta.push([P.id, d.id]);
    const colW = M.w / M.cols;
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.beginPath();
    ctx.moveTo(cx - M.w / 2, M.y - M.gap * 0.9);
    ctx.lineTo(cx + M.w / 2, M.y - M.gap * 0.9);
    ctx.stroke();
    meta.forEach(([lbl, val], i) => {
      const mx = cx - M.w / 2 + colW * i + colW / 2;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = font(600, M.lbl);
      ctx.fillText(lbl.toUpperCase(), mx, M.y);
      ctx.fillStyle = "#ffffff";
      fitSize(ctx, val, 700, M.val, 9, colW - 16);
      ctx.fillText(val, mx, M.y + M.val * 1.45);
    });

    // patička: ID + ověřovací odkaz, upozornění
    const shortUrl = d.url.replace(/^https?:\/\//, "");
    const foot = M.cols === 4 ? `${P.verify} ${shortUrl}` : `${P.id} ${d.id}   ·   ${P.verify} ${shortUrl}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    fitSize(ctx, foot, 600, L.footer[1], 9, W - 2 * L.pad);
    ctx.fillText(foot, cx, L.footer[0]);
    ctx.fillStyle = "rgba(255,255,255,0.40)";
    ctx.font = font(500, L.disclaimer[1]);
    ctx.fillText(P.disclaimer, cx, L.disclaimer[0]);

    // pečeť (jen A4)
    if (L.seal && logo) {
      const { x, y, r } = L.seal;
      ctx.save();
      ctx.shadowColor = "rgba(20,241,149,0.45)";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "rgba(20,241,149,0.75)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "rgba(20,241,149,0.30)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r - 7, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(20,241,149,0.06)";
      ctx.beginPath(); ctx.arc(x, y, r - 7, 0, Math.PI * 2); ctx.fill();
      ctx.drawImage(logo, x - r * 0.52, y - r * 0.56, r * 1.04, r * 1.04);
    }
    return canvas;
  }

  // =====================================================================
  // Backend
  // =====================================================================
  let accounts = [];
  let certs = [];
  let loadedAt = 0;
  let loading = null;

  async function getToken() {
    if (typeof FundlyBackend === "undefined") return null;
    const client = await FundlyBackend.getClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return (data && data.session && data.session.access_token) || null;
  }

  async function load() {
    if (typeof fundlyBackendEnabled !== "function" || !fundlyBackendEnabled()) return;
    if (loading) return loading;
    loading = (async () => {
      try {
        const client = await FundlyBackend.getClient();
        if (!client) return;
        const { data: sess } = await client.auth.getSession();
        if (!sess || !sess.session) return;
        const [accRes, certRes] = await Promise.all([
          client.from("challenge_accounts")
            .select("id, package_key, capital, state, nickname, created_at, phase2_completed_at")
            .order("created_at", { ascending: false }),
          client.from("certificates")
            .select("id, account_id, kind, display_name, package_key, capital, passed_at, issued_at, stats, revoked"),
        ]);
        if (accRes.error) return;
        accounts = accRes.data || [];
        certs = certRes.error ? [] : (certRes.data || []); // tabulka ještě nemusí existovat
        loadedAt = Date.now();
        render();
      } catch (e) { /* bez backendu panel zůstane skrytý */ } finally { loading = null; }
    })();
    return loading;
  }

  function items() {
    return accounts
      .filter((a) => a.phase2_completed_at)
      .map((a) => ({ account: a, cert: certs.find((c) => c.account_id === a.id && !c.revoked) || null }));
  }

  async function issue(accountId, displayName) {
    const token = await getToken();
    if (!token) return { error: t("errSignIn") };
    const res = await fetch(`${FUNDLY_SUPABASE_URL}/functions/v1/certificate-issue`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, displayName: displayName || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.certificate) {
      certs = certs.filter((c) => c.id !== data.certificate.id).concat([data.certificate]);
      render();
      return { cert: data.certificate };
    }
    return { code: data.code || "error", error: data.error };
  }

  // =====================================================================
  // UI: panel v Profilu + karta v Přehledu
  // =====================================================================
  const promoKey = (id) => `fundly:certPromoHidden:${id}`;
  function promoHidden(id) { try { return localStorage.getItem(promoKey(id)) === "1"; } catch (e) { return false; } }

  function render() {
    const lang = certLang();
    const list = items();
    const panel = document.getElementById("certPanel");
    if (panel) {
      panel.hidden = !loadedAt;
      const rows = list.map(({ account, cert }) => {
        const meta = t("itemMeta", {
          pkg: esc(pkgName(account.package_key)),
          capital: esc(fmtMoney(account.capital, lang)),
          date: esc(fmtDate(account.phase2_completed_at, lang)),
        });
        return `<div class="cert-item">
          <span class="cert-item-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="8" r="5.2" stroke="currentColor" stroke-width="1.7"/><path d="M7 12.4L5.8 18l4.2-2.2 4.2 2.2-1.2-5.6" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg></span>
          <span class="cert-item-txt"><b>${esc(t("itemTitle"))}</b><small>${meta}</small>${cert ? `<small class="cert-item-id">${esc(cert.id)}</small>` : `<small>${esc(t("notIssued"))}</small>`}</span>
          <button type="button" class="btn btn-primary cert-open" data-cert-account="${esc(account.id)}">${esc(t("open"))}</button>
        </div>`;
      }).join("");
      panel.innerHTML = `<h3>${esc(t("panelTitle"))}</h3>
        <p class="t-small cert-intro">${esc(t("panelIntro"))}</p>
        ${rows ? `<div class="cert-list">${rows}</div>` : `<p class="cert-empty">${esc(t("empty"))}</p>`}`;
    }

    // karta v Přehledu: jen u aktuálního účtu (aktivní / funded / čeká na schválení) se splněnou Fází 2
    const promo = document.getElementById("certPromo");
    if (promo) {
      const current = accounts.find((a) => a.state === "active" || a.state === "funded" || a.state === "pending_approval");
      const show = !!(current && current.phase2_completed_at && !promoHidden(current.id));
      promo.hidden = !show;
      if (show) {
        promo.innerHTML = `<button type="button" class="cert-promo-x" data-cert-hide="${esc(current.id)}" aria-label="${esc(t("hide"))}" title="${esc(t("hide"))}">&times;</button>
          <h3>${esc(t("cardTitle"))}</h3>
          <p class="t-small">${esc(t("cardBody"))}</p>
          <button type="button" class="btn btn-primary cert-open" data-cert-account="${esc(current.id)}">${esc(t("cardBtn"))}</button>`;
      }
    }
  }

  // ---------- modal ----------
  let modal = null;
  let modalState = null; // { accountId, cert, pngBlob, pngUrl }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "modal-backdrop cert-backdrop";
    modal.hidden = true;
    modal.innerHTML = `<div class="modal cert-modal" role="dialog" aria-modal="true" aria-labelledby="certModalTitle">
      <button type="button" class="modal-close" data-cert-close aria-label="Close"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
      <h2 class="cert-modal-title" id="certModalTitle"></h2>
      <div class="cert-modal-body"></div>
    </div>`;
    modal.addEventListener("click", (e) => {
      if (e.target === modal || e.target.closest("[data-cert-close]")) closeModal();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal && !modal.hidden) closeModal(); });
    document.body.appendChild(modal);
    return modal;
  }
  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    if (modalState && modalState.pngUrl) URL.revokeObjectURL(modalState.pngUrl);
    modalState = null;
  }
  function setModal(title, html) {
    ensureModal();
    modal.querySelector(".cert-modal-title").textContent = title;
    modal.querySelector(".modal-close").setAttribute("aria-label", t("close"));
    modal.querySelector(".cert-modal-body").innerHTML = html;
    modal.hidden = false;
  }

  function showNameStep(accountId, errorText) {
    modalState = { accountId };
    setModal(t("nameTitle"), `<form class="cert-name-form" novalidate>
      <p class="t-small">${esc(t("nameIntro"))}</p>
      <label class="cert-label" for="certNameInput">${esc(t("nameLabel"))}</label>
      <input class="input cert-name-input" id="certNameInput" maxlength="40" autocomplete="name" placeholder="${esc(t("namePh"))}" required />
      <p class="cert-err" ${errorText ? "" : "hidden"}>${esc(errorText || "")}</p>
      <button type="submit" class="btn btn-primary cert-create">${esc(t("create"))}</button>
    </form>`);
    const form = modal.querySelector(".cert-name-form");
    const input = form.querySelector("input");
    setTimeout(() => input.focus(), 50);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = input.value.replace(/\s+/g, " ").trim();
      const err = form.querySelector(".cert-err");
      if (name.length < 2 || name.includes("@")) { err.textContent = t("errName"); err.hidden = false; return; }
      const btn = form.querySelector(".cert-create");
      btn.disabled = true;
      btn.textContent = t("creating");
      const r = await issue(accountId, name).catch(() => ({ error: t("errGeneric") }));
      if (r.cert) { showPreview(r.cert); return; }
      btn.disabled = false;
      btn.textContent = t("create");
      err.textContent = r.code === "name_invalid" || r.code === "name_required" ? t("errName") : (r.code === "revoked" ? t("errRevoked") : t("errGeneric"));
      err.hidden = false;
    });
  }

  async function showPreview(cert) {
    if (modalState && modalState.pngUrl) URL.revokeObjectURL(modalState.pngUrl);
    modalState = { accountId: cert.account_id, cert };
    const url = verifyUrl(cert.id);
    setModal(t("itemTitle"), `<div class="cert-preview"><div class="cert-loading">${esc(t("preparing"))}</div></div>
      <div class="cert-actions">
        <button type="button" class="btn btn-primary" data-cert-act="png">${esc(t("dlPng"))}</button>
        <button type="button" class="btn btn-ghost" data-cert-act="pdf">${esc(t("dlPdf"))}</button>
        <button type="button" class="btn btn-ghost" data-cert-act="linkedin">${esc(t("linkedin"))}</button>
        <button type="button" class="btn btn-ghost" data-cert-act="copy">${esc(t("copy"))}</button>
      </div>
      <div class="cert-link"><span>${esc(t("verifyLabel"))}</span><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url.replace(/^https:\/\//, ""))}</a></div>
      <p class="cert-err" hidden></p>`);
    const state = modalState;
    try {
      const canvas = await renderCanvas(certData(cert, certLang()), "portrait");
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (modalState !== state) return; // modal mezitím zavřený / přepnutý
      state.pngBlob = blob;
      state.pngUrl = URL.createObjectURL(blob);
      const box = modal.querySelector(".cert-preview");
      box.innerHTML = `<img src="${state.pngUrl}" alt="${esc(t("previewAlt"))}" width="1080" height="1350" />`;
    } catch (e) {
      showErr(t("errGeneric"));
    }
  }

  function showErr(text) {
    const el = modal && modal.querySelector(".cert-modal-body .cert-err");
    if (!el) return;
    el.textContent = text;
    el.hidden = !text;
  }

  function fileBase(cert) { return `fundly-certificate-${cert.id}`; }
  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    const href = URL.createObjectURL(blob);
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  }

  async function actPng() {
    const st = modalState;
    if (!st || !st.cert) return;
    let blob = st.pngBlob;
    if (!blob) {
      const canvas = await renderCanvas(certData(st.cert, certLang()), "portrait");
      blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    }
    const name = fileBase(st.cert) + ".png";
    // na telefonu nabídnout rovnou sdílení (Instagram), jinak stáhnout
    try {
      const file = new File([blob], name, { type: "image/png" });
      const touch = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Fundly Certified Analyst" });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    downloadBlob(blob, name);
  }

  let jspdfPromise = null;
  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!jspdfPromise) {
      jspdfPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = JSPDF_SRC;
        s.crossOrigin = "anonymous";
        s.onload = () => (window.jspdf && window.jspdf.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("jsPDF missing")));
        s.onerror = () => { jspdfPromise = null; reject(new Error("jsPDF failed to load")); };
        document.head.appendChild(s);
      });
    }
    return jspdfPromise;
  }

  async function actPdf(btn) {
    const st = modalState;
    if (!st || !st.cert) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = t("creating");
    try {
      const [JsPDF, canvas] = await Promise.all([loadJsPdf(), renderCanvas(certData(st.cert, certLang()), "landscape")]);
      const pdf = new JsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
      pdf.setProperties({ title: `Fundly Certified Analyst — ${st.cert.id}`, author: "Fundly", subject: verifyUrl(st.cert.id) });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 297, 210);
      // klikací ověřovací odkaz přes patičku (souřadnice z LAYOUTS.landscape.footer)
      const k = 297 / LAYOUTS.landscape.W;
      pdf.link(60 * k, (LAYOUTS.landscape.footer[0] - 16) * k, (LAYOUTS.landscape.W - 120) * k, 22 * k, { url: verifyUrl(st.cert.id) });
      pdf.save(fileBase(st.cert) + ".pdf");
      showErr("");
    } catch (e) {
      showErr(t("errPdf"));
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  async function actCopy(btn) {
    const st = modalState;
    if (!st || !st.cert) return;
    const url = verifyUrl(st.cert.id);
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch (err) { ok = false; }
      ta.remove();
    }
    if (ok) {
      btn.textContent = t("copied");
      setTimeout(() => { btn.textContent = t("copy"); }, 1800);
    }
  }

  function actLinkedIn() {
    const st = modalState;
    if (!st || !st.cert) return;
    const share = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(verifyUrl(st.cert.id));
    window.open(share, "_blank", "noopener,noreferrer");
  }

  async function openFor(accountId) {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return;
    const existing = certs.find((c) => c.account_id === accountId && !c.revoked);
    if (existing) { showPreview(existing); return; }
    const nick = String(acc.nickname || "").trim();
    if (!nick) { showNameStep(accountId); return; }
    setModal(t("itemTitle"), `<div class="cert-loading">${esc(t("creating"))}</div>`);
    modalState = { accountId };
    const r = await issue(accountId, null).catch(() => ({ error: t("errGeneric") }));
    if (r.cert) { showPreview(r.cert); return; }
    if (r.code === "name_required" || r.code === "name_invalid") { showNameStep(accountId); return; }
    setModal(t("itemTitle"), `<p class="cert-err">${esc(r.code === "revoked" ? t("errRevoked") : t("errGeneric"))}</p>`);
  }

  // ---------- události ----------
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-cert-account]");
    if (open) { e.preventDefault(); openFor(open.dataset.certAccount); return; }
    const hide = e.target.closest("[data-cert-hide]");
    if (hide) {
      try { localStorage.setItem(promoKey(hide.dataset.certHide), "1"); } catch (err) { /* */ }
      const promo = document.getElementById("certPromo");
      if (promo) promo.hidden = true;
      return;
    }
    const act = e.target.closest("[data-cert-act]");
    if (act) {
      const a = act.dataset.certAct;
      if (a === "png") actPng().catch(() => showErr(t("errGeneric")));
      else if (a === "pdf") actPdf(act);
      else if (a === "copy") actCopy(act);
      else if (a === "linkedin") actLinkedIn();
      return;
    }
    // návrat do Profilu / Přehledu: znovu načíst (fáze mohla být mezitím schválená)
    const nav = e.target.closest('[data-view="profil"], [data-view="prehled"]');
    if (nav && Date.now() - loadedAt > 20000) load();
  });

  document.addEventListener("fundly:lang-changed", () => {
    render();
    if (modal && !modal.hidden && modalState && modalState.cert) showPreview(modalState.cert);
  });

  function start() {
    load();
    // dashboard.js mezitím může dokončit přihlášení / obnovu session
    setTimeout(() => { if (!loadedAt) load(); }, 2500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  // pro ruční test vykreslení (a případné další použití)
  window.FundlyCertificate = { renderCanvas, certData, reload: load };
})();
