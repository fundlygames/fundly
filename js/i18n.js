/* Fundly — i18n: language dictionary + switcher + geo-based auto-detect.
   Load BEFORE page-specific scripts. Static HTML text is translated via
   [data-i18n="key.path"] (textContent) / [data-i18n-html="key.path"]
   (innerHTML, for strings needing inline tags like <strong>) /
   [data-i18n-placeholder="key.path"] / [data-i18n-aria-label="key.path"].
   JS-rendered strings (packages picker, etc.) call window.t("key.path").
   Legal pages (terms/privacy/rules/refund/disclaimer) are intentionally
   NOT translated yet — those need a legal/compliance review pass before
   shipping a non-English version of binding text. */

const FUNDLY_I18N = (() => {
  const DICT = {
    en: {
      nav: {
        howItWorks: "How it works", packages: "Packages", whyFundly: "Why Fundly", faq: "FAQ", contact: "Contact",
        login: "Log in", startChallenge: "Start the Challenge",
      },
      hero: {
        titleDim: "Get Simulated Capital", titleRest: "for Your Sports Analytics.",
        sub: "Test your analytical skills in a simulated environment — no personal bankroll required. Complete our 2-phase evaluation, become a B2B partner, and receive up to an <strong>80%</strong> reward for your performance data.",
        start: "Start Challenge", howItWorks: "How it works",
      },
      stats: { phases: "Evaluation phases", maxCapital: "Max. capital", daysPerPhase: "Days per phase", split: "Performance split" },
      how: {
        fan1: "Challenge", fan2: "Verification", fan3: "Rewards",
        s1h: "Evaluation (Testing Phase)",
        s1p: "Purchase access to our analytical simulation software and demonstrate your risk management strategy within a 30-day window, from $2,000 up to $100,000 in simulated capital.",
        s2h: "Verification (Risk Control)",
        s2p: "Confirm your consistency and data discipline under a lower profit target in a simulated environment. You know the rules upfront and they never change.",
        s3h: "Partner Status &amp; Performance Rewards",
        s3p: "Sign an Independent Contractor Agreement (B2B), provide your simulation data, and receive up to 80% performance rewards against valid invoices, for as long as you want.",
      },
      packages: {
        heading: "Choose your capital", sub: "From $2,000 up to $100,000. The larger the simulated capital, the higher the performance reward potential.",
        accountSize: "Account size",
        phase1Tag: "Phase 1", phase1Name: "Fundly Challenge",
        phase2Tag: "Phase 2", phase2Name: "Verification",
        phase3Tag: "Partner Account", phase3Name: "Fundly Partner",
        profitTarget: "Profit target", maxLossStatic: "Max. loss (static)", maxLossTrailing: "Max. loss (trailing)",
        maxDailyLoss: "Max. daily loss", timeLimit: "Time limit", days30: "30 days", unlimited: "Unlimited",
        qualifyingEntries: "Qualifying entries", yourShare: "Your share", permissibleOdds: "Permissible odds ratio",
        pkgSuffix: "package", simCapital: "simulated capital at your disposal",
        f1: "2 evaluation phases", f2: "80 % performance split", f3: "Max. entry size", f4: "Unlimited time in the partner phase", f5: "Daily loss limit −4 % of capital",
        oneTime: "one-time", buy: "Buy the Challenge",
        note: "One-time fee · 30 days per phase · no subscription",
      },
      dashPreview: {
        heading: "Your dashboard, built for clarity", sub: "Real-time balance, live entries and performance stats — everything in one place, no spreadsheets.",
        overview: "Overview", liveEntries: "Live entries", performance: "Performance",
      },
      why: {
        heading: "Why Fundly?", sub: "Up to $100,000 in simulated capital, fair rules and contractor payouts on time.",
        h1: "Every sport. One account.", p1: "Football, hockey, tennis and esports. Simulation coefficients from 1.00 to 8.00 on any sport you know best.",
        h2: "Fair and clear rules", p2: "You know the targets, drawdown and limits before you pay. A clear −4 % daily loss limit, no fine print.",
        h3: "Real-time overview", p3: "Track your challenge progress, limits and rewards in one place, without spreadsheets and guesswork.",
        h4: "Fast support and rewards", p4: "Support replies within hours and approved contractor rewards are disbursed within 48 hours.",
        bigLbl: "simulated capital up to — you bring the judgment, we provide the platform",
        splitLbl: "performance split, fixed forever", speedLbl: "reward approval",
      },
      comparison: {
        heading: "Learn without the risk", sub: "It's a simulation — you analyze real sports data, but you never risk your own capital.",
        tagA: "Risking your own capital", entityA: "On your own", subA: "Real money · real risk",
        tagB: "The Fundly way", entityB: "Fundly", subB: "Simulated capital · no personal bankroll required",
        r1a: "Your own money", r1pill: "Personal Capital", r1b: "Up to <b>$100,000</b> of simulated capital",
        r2a: "Unlimited risk", r2pill: "Risk", r2b: "<b>One-time fee</b>, nothing more",
        r3a: "Limited capital", r3pill: "Upside", r3b: "<b>80 %</b> performance split",
        r4a: "Tilt &amp; guesswork", r4pill: "Discipline", r4b: "Clear phases &amp; rules",
        r5a: "Alone", r5pill: "Support", r5b: "Community &amp; support",
      },
      faq: {
        heading: "Frequently asked questions",
        q1: "Is Fundly Games a bookmaker or gambling platform?",
        a1: "No. Fundly Games is strictly an educational and analytical simulation platform. We do not accept wagers, bets, or deposits for gambling. All accounts operate exclusively within a 100% simulated environment using virtual credits with zero real-world value.",
        q2: "How does the Challenge work?",
        a2: "The Challenge has two phases. In the first you must reach a profit target of 10 % of capital, in the second 5 %, both within 30 days while respecting the static max. loss limit of 10 % of capital and the daily loss limit of 4 % of capital. In each phase you also need at least 5 winning simulation entries with a net profit of at least 0.5 % of capital. After passing both phases you transition to the Phase 3 Fundly Partner account with no time limit and a trailing max. loss of 10 % from your highest balance.",
        q3: "What are the simulation entry rules?",
        a3: "You can submit simulated entries on all sports with a permissible coefficient range of 1.00 to 8.00. The maximum simulated risk per entry is 1.5 % of account capital and in each phase you must have at least 5 winning entries with a net profit of at least 0.5 % of capital, so the result never comes down to a single entry.",
        q4: "How are performance rewards disbursed?",
        a4: "Successful analysts in Phase 3 operate as independent B2B contractors. Based on verified performance data and challenge rules — a profit buffer of +5 % of capital and 5 qualifying entries, up to $4,000 per request — contractors submit invoices to Grindit LLC, which are settled via bank transfer, crypto assets, or electronic wallets within 48 hours of approval.",
        q5: "What if I fail the Challenge?",
        a5: "You only lose the one-time evaluation fee, nothing more. You can buy a new Challenge anytime and try again — or restart cheaper: the reset fee is just 40 % of the package price.",
      },
      cta: {
        heading: "Ready to put your analytics to the test?", sub: "Put your analytical skills to the test. No personal bankroll required, only your skill.",
        start: "Start the Challenge", from: "From $26", oneTime: "One-time fee", support: "24/7 support",
      },
      contact: {
        heading: "Get in touch", sub: "Questions about a package, payout, or your account? Send us a message.",
        email: "Email", subject: "Subject", subjectPh: "What's this about?", message: "Message", messagePh: "How can we help?", send: "Send message",
      },
      footer: {
        tagline: "A professional evaluation platform for sports analysts. Up to $100,000 in simulated capital and an 80 % performance split.",
        packages: "Packages", information: "Information", support: "Support",
        contactUs: "Contact us", telegram: "Chat on Telegram", status: "Service status",
        legal: "Legal Disclaimer: Fundly.games is operated by Grindit LLC (Sharjah Media City, Sharjah, UAE, Reg: 2541536). Fundly Games is not a bookmaker, gambling operator, or financial institution. All services, evaluation challenges, and metrics provided on this platform are strictly for educational and analytical simulation purposes, utilizing virtual credits with zero monetary value. Challenge fees cover software licensing, data evaluation, and analytical platform access.",
        rights: "© 2026 Fundly. All rights reserved.",
        privacy: "Privacy", terms: "Terms", rules: "Rules", disclaimer: "Disclaimer", refund: "Refund",
      },
      auth: {
        login: "Log in", loginSub: "Log in to your account", email: "E-mail", password: "Password",
        forgot: "Forgot password?", noAccount: "No account yet?", signUp: "Sign up",
      },
    },

    cs: {
      nav: {
        howItWorks: "Jak to funguje", packages: "Balíčky", whyFundly: "Proč Fundly", faq: "FAQ", contact: "Kontakt",
        login: "Přihlásit se", startChallenge: "Spustit Challenge",
      },
      hero: {
        titleDim: "Získejte simulovaný kapitál", titleRest: "pro vaši sportovní analytiku.",
        sub: "Otestujte své analytické schopnosti v simulovaném prostředí — bez rizika vlastního kapitálu. Absolvujte naše dvoufázové hodnocení, staňte se B2B partnerem a získejte až <strong>80%</strong> odměnu za svůj výkon.",
        start: "Spustit Challenge", howItWorks: "Jak to funguje",
      },
      stats: { phases: "Hodnoticí fáze", maxCapital: "Max. kapitál", daysPerPhase: "Dní na fázi", split: "Podíl na zisku" },
      how: {
        fan1: "Challenge", fan2: "Verifikace", fan3: "Odměny",
        s1h: "Hodnocení (testovací fáze)",
        s1p: "Zakupte si přístup k naší analytické simulační platformě a prokažte svou strategii řízení rizika v 30denním okně, od $2 000 do $100 000 simulovaného kapitálu.",
        s2h: "Verifikace (kontrola rizika)",
        s2p: "Potvrďte svou konzistenci a disciplínu při nižším cílovém zisku v simulovaném prostředí. Pravidla znáte předem a nikdy se nemění.",
        s3h: "Status partnera a výkonnostní odměny",
        s3p: "Podepište smlouvu nezávislého dodavatele (B2B), poskytněte svá simulační data a získávejte až 80% výkonnostní odměny na základě platných faktur, jak dlouho budete chtít.",
      },
      packages: {
        heading: "Vyberte si kapitál", sub: "Od $2 000 do $100 000. Čím větší simulovaný kapitál, tím vyšší potenciál výkonnostní odměny.",
        accountSize: "Velikost účtu",
        phase1Tag: "Fáze 1", phase1Name: "Fundly Challenge",
        phase2Tag: "Fáze 2", phase2Name: "Verifikace",
        phase3Tag: "Partnerský účet", phase3Name: "Fundly Partner",
        profitTarget: "Cílový zisk", maxLossStatic: "Max. ztráta (statická)", maxLossTrailing: "Max. ztráta (klouzavá)",
        maxDailyLoss: "Max. denní ztráta", timeLimit: "Časový limit", days30: "30 dní", unlimited: "Bez limitu",
        qualifyingEntries: "Kvalifikační tikety", yourShare: "Váš podíl", permissibleOdds: "Povolený kurzový rozsah",
        pkgSuffix: "balíček", simCapital: "simulovaného kapitálu k dispozici",
        f1: "2 hodnoticí fáze", f2: "80% podíl na zisku", f3: "Max. velikost tiketu", f4: "Neomezený čas v partnerské fázi", f5: "Denní limit ztráty −4 % kapitálu",
        oneTime: "jednorázově", buy: "Koupit Challenge",
        note: "Jednorázový poplatek · 30 dní na fázi · žádné předplatné",
      },
      dashPreview: {
        heading: "Váš dashboard, postavený pro přehlednost", sub: "Zůstatek v reálném čase, živé tikety a výkonnostní statistiky — vše na jednom místě, žádné tabulky.",
        overview: "Přehled", liveEntries: "Živé tikety", performance: "Výkon",
      },
      why: {
        heading: "Proč Fundly?", sub: "Až $100 000 simulovaného kapitálu, fair pravidla a dodavatelské odměny včas.",
        h1: "Každý sport. Jeden účet.", p1: "Fotbal, hokej, tenis i esporty. Simulační kurzy od 1.00 do 8.00 na jakémkoliv sportu, kterému rozumíte nejlépe.",
        h2: "Fair a jasná pravidla", p2: "Cíle, drawdown i limity znáte ještě před zaplacením. Jasný −4% denní limit ztráty, žádné drobné písmo.",
        h3: "Přehled v reálném čase", p3: "Sledujte postup ve výzvě, limity i odměny na jednom místě, bez tabulek a odhadování.",
        h4: "Rychlá podpora a odměny", p4: "Podpora odpovídá do hodin a schválené dodavatelské odměny jsou vyplaceny do 48 hodin.",
        bigLbl: "simulovaného kapitálu až — vy přinášíte úsudek, my platformu",
        splitLbl: "podíl na zisku, napevno navždy", speedLbl: "schválení odměny",
      },
      comparison: {
        heading: "Učte se bez rizika", sub: "Je to simulace — analyzujete reálná sportovní data, ale nikdy neriskujete vlastní kapitál.",
        tagA: "Riskujete vlastní kapitál", entityA: "Na vlastní pěst", subA: "Skutečné peníze · skutečné riziko",
        tagB: "Cesta Fundly", entityB: "Fundly", subB: "Simulovaný kapitál · bez rizika vlastního bankrollu",
        r1a: "Vaše vlastní peníze", r1pill: "Vlastní kapitál", r1b: "Až <b>$100 000</b> simulovaného kapitálu",
        r2a: "Neomezené riziko", r2pill: "Riziko", r2b: "Jen <b>jednorázový poplatek</b>, nic víc",
        r3a: "Omezený kapitál", r3pill: "Potenciál", r3b: "<b>80%</b> podíl na zisku",
        r4a: "Tilt a odhady", r4pill: "Disciplína", r4b: "Jasné fáze a pravidla",
        r5a: "Sami", r5pill: "Podpora", r5b: "Komunita a podpora",
      },
      faq: {
        heading: "Často kladené otázky",
        q1: "Je Fundly Games sázková kancelář nebo hazardní platforma?",
        a1: "Ne. Fundly Games je výhradně vzdělávací a analytická simulační platforma. Nepřijímáme sázky, vklady ani platby za hazardní hry. Všechny účty fungují výhradně ve 100% simulovaném prostředí s virtuálními kredity s nulovou reálnou hodnotou.",
        q2: "Jak funguje Challenge?",
        a2: "Challenge má dvě fáze. V první musíte dosáhnout cílového zisku 10 % kapitálu, ve druhé 5 %, obojí do 30 dní při dodržení statického limitu max. ztráty 10 % kapitálu a denního limitu ztráty 4 % kapitálu. V každé fázi také potřebujete alespoň 5 vítězných simulačních tiketů s čistým ziskem alespoň 0,5 % kapitálu. Po úspěšném zvládnutí obou fází přecházíte do fáze 3 — účtu Fundly Partner bez časového omezení a s klouzavou max. ztrátou 10 % z vašeho nejvyššího zůstatku.",
        q3: "Jaká jsou pravidla pro simulační tikety?",
        a3: "Simulační tikety můžete zadávat na všechny sporty s povoleným rozsahem kurzů 1.00 až 8.00. Maximální simulované riziko na tiket je 1,5 % kapitálu účtu a v každé fázi potřebujete alespoň 5 vítězných tiketů s čistým ziskem alespoň 0,5 % kapitálu, takže výsledek nikdy nezávisí na jediném tiketu.",
        q4: "Jak se vyplácí výkonnostní odměny?",
        a4: "Úspěšní analytici ve fázi 3 fungují jako nezávislí B2B dodavatelé. Na základě ověřených výkonnostních dat a pravidel výzvy — ziskový polštář +5 % kapitálu a 5 kvalifikačních tiketů, až $4 000 na žádost — podávají dodavatelé faktury společnosti Grindit LLC, které jsou vyrovnány bankovním převodem, kryptoaktivy nebo elektronickými peněženkami do 48 hodin od schválení.",
        q5: "Co když Challenge nesplním?",
        a5: "Přijdete pouze o jednorázový poplatek za hodnocení, nic víc. Novou Challenge si můžete koupit kdykoliv a zkusit to znovu — nebo restartovat levněji: reset stojí jen 40 % ceny balíčku.",
      },
      cta: {
        heading: "Připraveni otestovat svou analytiku?", sub: "Otestujte své analytické schopnosti. Bez rizika vlastního bankrollu, jen vaše dovednosti.",
        start: "Spustit Challenge", from: "Od $26", oneTime: "Jednorázový poplatek", support: "Podpora 24/7",
      },
      contact: {
        heading: "Ozvěte se nám", sub: "Dotaz na balíček, odměnu nebo váš účet? Napište nám.",
        email: "E-mail", subject: "Předmět", subjectPh: "Čeho se to týká?", message: "Zpráva", messagePh: "Jak vám můžeme pomoct?", send: "Odeslat zprávu",
      },
      footer: {
        tagline: "Profesionální hodnoticí platforma pro sportovní analytiky. Až $100 000 simulovaného kapitálu a 80% podíl na zisku.",
        packages: "Balíčky", information: "Informace", support: "Podpora",
        contactUs: "Kontaktujte nás", telegram: "Chat na Telegramu", status: "Stav služby",
        legal: "Právní upozornění: Fundly.games provozuje společnost Grindit LLC (Sharjah Media City, Sharjah, SAE, Reg: 2541536). Fundly Games není sázková kancelář, hazardní provozovatel ani finanční instituce. Všechny služby, hodnoticí výzvy a metriky na této platformě slouží výhradně ke vzdělávacím a analytickým simulačním účelům s využitím virtuálních kreditů s nulovou peněžní hodnotou. Poplatky za výzvu pokrývají licencování softwaru, vyhodnocení dat a přístup k analytické platformě.",
        rights: "© 2026 Fundly. Všechna práva vyhrazena.",
        privacy: "Soukromí", terms: "Podmínky", rules: "Pravidla", disclaimer: "Upozornění", refund: "Vrácení peněz",
      },
      auth: {
        login: "Přihlásit se", loginSub: "Přihlaste se do svého účtu", email: "E-mail", password: "Heslo",
        forgot: "Zapomenuté heslo?", noAccount: "Ještě nemáte účet?", signUp: "Zaregistrovat se",
      },
    },

    es: {
      nav: {
        howItWorks: "Cómo funciona", packages: "Paquetes", whyFundly: "Por qué Fundly", faq: "FAQ", contact: "Contacto",
        login: "Iniciar sesión", startChallenge: "Comenzar el Challenge",
      },
      hero: {
        titleDim: "Consigue capital simulado", titleRest: "para tu análisis deportivo.",
        sub: "Pon a prueba tus habilidades analíticas en un entorno simulado — sin arriesgar tu propio capital. Completa nuestra evaluación de 2 fases, conviértete en socio B2B y recibe hasta un <strong>80%</strong> de recompensa por tu rendimiento.",
        start: "Comenzar Challenge", howItWorks: "Cómo funciona",
      },
      stats: { phases: "Fases de evaluación", maxCapital: "Capital máx.", daysPerPhase: "Días por fase", split: "Reparto de rendimiento" },
      how: {
        fan1: "Challenge", fan2: "Verificación", fan3: "Recompensas",
        s1h: "Evaluación (fase de prueba)",
        s1p: "Adquiere acceso a nuestro software de simulación analítica y demuestra tu estrategia de gestión de riesgo en una ventana de 30 días, desde $2,000 hasta $100,000 de capital simulado.",
        s2h: "Verificación (control de riesgo)",
        s2p: "Confirma tu consistencia y disciplina con un objetivo de beneficio menor en un entorno simulado. Conoces las reglas de antemano y nunca cambian.",
        s3h: "Estatus de socio y recompensas por rendimiento",
        s3p: "Firma un acuerdo de contratista independiente (B2B), aporta tus datos de simulación y recibe hasta un 80% de recompensa por rendimiento contra facturas válidas, durante el tiempo que quieras.",
      },
      packages: {
        heading: "Elige tu capital", sub: "Desde $2,000 hasta $100,000. Cuanto mayor el capital simulado, mayor el potencial de recompensa por rendimiento.",
        accountSize: "Tamaño de cuenta",
        phase1Tag: "Fase 1", phase1Name: "Fundly Challenge",
        phase2Tag: "Fase 2", phase2Name: "Verificación",
        phase3Tag: "Cuenta de socio", phase3Name: "Fundly Partner",
        profitTarget: "Objetivo de beneficio", maxLossStatic: "Pérdida máx. (estática)", maxLossTrailing: "Pérdida máx. (dinámica)",
        maxDailyLoss: "Pérdida máx. diaria", timeLimit: "Límite de tiempo", days30: "30 días", unlimited: "Sin límite",
        qualifyingEntries: "Tickets clasificatorios", yourShare: "Tu parte", permissibleOdds: "Rango de cuotas permitido",
        pkgSuffix: "paquete", simCapital: "de capital simulado a tu disposición",
        f1: "2 fases de evaluación", f2: "80% de reparto de rendimiento", f3: "Tamaño máx. de entrada", f4: "Tiempo ilimitado en la fase de socio", f5: "Límite de pérdida diaria −4% del capital",
        oneTime: "pago único", buy: "Comprar el Challenge",
        note: "Pago único · 30 días por fase · sin suscripción",
      },
      dashPreview: {
        heading: "Tu panel, diseñado para la claridad", sub: "Saldo en tiempo real, tickets en vivo y estadísticas de rendimiento — todo en un solo lugar, sin hojas de cálculo.",
        overview: "Resumen", liveEntries: "Tickets en vivo", performance: "Rendimiento",
      },
      why: {
        heading: "¿Por qué Fundly?", sub: "Hasta $100,000 de capital simulado, reglas justas y pagos a contratistas puntuales.",
        h1: "Cada deporte. Una cuenta.", p1: "Fútbol, hockey, tenis y esports. Cuotas de simulación de 1.00 a 8.00 en el deporte que mejor conozcas.",
        h2: "Reglas justas y claras", p2: "Conoces los objetivos, el drawdown y los límites antes de pagar. Un límite claro de pérdida diaria del −4%, sin letra pequeña.",
        h3: "Visión en tiempo real", p3: "Sigue tu progreso en el challenge, límites y recompensas en un solo lugar, sin hojas de cálculo ni suposiciones.",
        h4: "Soporte y recompensas rápidas", p4: "El soporte responde en horas y las recompensas de contratista aprobadas se pagan en 48 horas.",
        bigLbl: "de capital simulado — tú aportas el criterio, nosotros la plataforma",
        splitLbl: "de reparto de rendimiento, fijo para siempre", speedLbl: "de aprobación de recompensa",
      },
      comparison: {
        heading: "Aprende sin riesgo", sub: "Es una simulación — analizas datos deportivos reales, pero nunca arriesgas tu propio capital.",
        tagA: "Arriesgando tu propio capital", entityA: "Por tu cuenta", subA: "Dinero real · riesgo real",
        tagB: "El camino Fundly", entityB: "Fundly", subB: "Capital simulado · sin necesidad de bankroll propio",
        r1a: "Tu propio dinero", r1pill: "Capital personal", r1b: "Hasta <b>$100,000</b> de capital simulado",
        r2a: "Riesgo ilimitado", r2pill: "Riesgo", r2b: "Solo <b>pago único</b>, nada más",
        r3a: "Capital limitado", r3pill: "Potencial", r3b: "<b>80%</b> de reparto de rendimiento",
        r4a: "Tilt e improvisación", r4pill: "Disciplina", r4b: "Fases y reglas claras",
        r5a: "Solo", r5pill: "Soporte", r5b: "Comunidad y soporte",
      },
      faq: {
        heading: "Preguntas frecuentes",
        q1: "¿Es Fundly Games una casa de apuestas o una plataforma de juego?",
        a1: "No. Fundly Games es estrictamente una plataforma de simulación educativa y analítica. No aceptamos apuestas, jugadas ni depósitos para juego. Todas las cuentas operan exclusivamente en un entorno 100% simulado con créditos virtuales sin valor real.",
        q2: "¿Cómo funciona el Challenge?",
        a2: "El Challenge tiene dos fases. En la primera debes alcanzar un objetivo de beneficio del 10% del capital, en la segunda del 5%, ambas en 30 días respetando el límite estático de pérdida máxima del 10% del capital y el límite de pérdida diaria del 4% del capital. En cada fase también necesitas al menos 5 tickets simulados ganadores con un beneficio neto de al menos el 0.5% del capital. Tras superar ambas fases, pasas a la cuenta Fundly Partner de la Fase 3, sin límite de tiempo y con una pérdida máxima dinámica del 10% desde tu saldo más alto.",
        q3: "¿Cuáles son las reglas para los tickets simulados?",
        a3: "Puedes enviar tickets simulados en todos los deportes con un rango de cuotas permitido de 1.00 a 8.00. El riesgo simulado máximo por ticket es del 1.5% del capital de la cuenta, y en cada fase necesitas al menos 5 tickets ganadores con un beneficio neto de al menos el 0.5% del capital, de modo que el resultado nunca dependa de un solo ticket.",
        q4: "¿Cómo se pagan las recompensas por rendimiento?",
        a4: "Los analistas exitosos en la Fase 3 operan como contratistas B2B independientes. Con base en datos de rendimiento verificados y las reglas del challenge — un colchón de beneficio del +5% del capital y 5 tickets clasificatorios, hasta $4,000 por solicitud — los contratistas envían facturas a Grindit LLC, que se liquidan por transferencia bancaria, criptoactivos o billeteras electrónicas dentro de las 48 horas posteriores a la aprobación.",
        q5: "¿Qué pasa si fallo el Challenge?",
        a5: "Solo pierdes la cuota de evaluación única, nada más. Puedes comprar un nuevo Challenge cuando quieras e intentarlo de nuevo — o reiniciar más barato: la tarifa de reinicio es solo el 40% del precio del paquete.",
      },
      cta: {
        heading: "¿Listo para poner a prueba tu análisis?", sub: "Pon a prueba tus habilidades analíticas. Sin necesidad de bankroll propio, solo tu talento.",
        start: "Comenzar el Challenge", from: "Desde $26", oneTime: "Pago único", support: "Soporte 24/7",
      },
      contact: {
        heading: "Ponte en contacto", sub: "¿Preguntas sobre un paquete, una recompensa o tu cuenta? Envíanos un mensaje.",
        email: "Correo electrónico", subject: "Asunto", subjectPh: "¿De qué se trata?", message: "Mensaje", messagePh: "¿Cómo podemos ayudarte?", send: "Enviar mensaje",
      },
      footer: {
        tagline: "Una plataforma de evaluación profesional para analistas deportivos. Hasta $100,000 de capital simulado y un 80% de reparto de rendimiento.",
        packages: "Paquetes", information: "Información", support: "Soporte",
        contactUs: "Contáctanos", telegram: "Chatear en Telegram", status: "Estado del servicio",
        legal: "Aviso legal: Fundly.games es operado por Grindit LLC (Sharjah Media City, Sharjah, EAU, Reg: 2541536). Fundly Games no es una casa de apuestas, operador de juego ni institución financiera. Todos los servicios, challenges de evaluación y métricas de esta plataforma son estrictamente para fines educativos y de simulación analítica, utilizando créditos virtuales sin valor monetario. Las cuotas del challenge cubren la licencia del software, la evaluación de datos y el acceso a la plataforma analítica.",
        rights: "© 2026 Fundly. Todos los derechos reservados.",
        privacy: "Privacidad", terms: "Términos", rules: "Reglas", disclaimer: "Aviso legal", refund: "Reembolso",
      },
      auth: {
        login: "Iniciar sesión", loginSub: "Inicia sesión en tu cuenta", email: "Correo electrónico", password: "Contraseña",
        forgot: "¿Olvidaste tu contraseña?", noAccount: "¿Aún no tienes cuenta?", signUp: "Regístrate",
      },
    },
    pl: {
      nav: {
        howItWorks: "Jak to działa", packages: "Pakiety", whyFundly: "Dlaczego Fundly", faq: "FAQ", contact: "Kontakt",
        login: "Zaloguj się", startChallenge: "Rozpocznij Challenge",
      },
      hero: {
        titleDim: "Zdobądź symulowany kapitał", titleRest: "do swojej analityki sportowej.",
        sub: "Przetestuj swoje umiejętności analityczne w symulowanym środowisku — bez ryzykowania własnego kapitału. Ukończ naszą 2-fazową ocenę, zostań partnerem B2B i otrzymuj do <strong>80%</strong> wynagrodzenia za swoje wyniki.",
        start: "Rozpocznij Challenge", howItWorks: "Jak to działa",
      },
      stats: { phases: "Fazy oceny", maxCapital: "Maks. kapitał", daysPerPhase: "Dni na fazę", split: "Podział zysku" },
      how: {
        fan1: "Challenge", fan2: "Weryfikacja", fan3: "Nagrody",
        s1h: "Ocena (faza testowa)",
        s1p: "Wykup dostęp do naszego oprogramowania symulacji analitycznej i wykaż się strategią zarządzania ryzykiem w oknie 30 dni, od $2000 do $100 000 symulowanego kapitału.",
        s2h: "Weryfikacja (kontrola ryzyka)",
        s2p: "Potwierdź swoją konsekwencję i dyscyplinę danych przy niższym celu zysku w symulowanym środowisku. Zasady znasz z góry i nigdy się nie zmieniają.",
        s3h: "Status partnera i wynagrodzenie za wyniki",
        s3p: "Podpisz umowę niezależnego kontrahenta (B2B), udostępnij swoje dane symulacyjne i otrzymuj do 80% wynagrodzenia za wyniki na podstawie ważnych faktur, tak długo, jak chcesz.",
      },
      packages: {
        heading: "Wybierz swój kapitał", sub: "Od $2000 do $100 000. Im większy symulowany kapitał, tym wyższy potencjał wynagrodzenia za wyniki.",
        accountSize: "Wielkość konta",
        phase1Tag: "Faza 1", phase1Name: "Fundly Challenge",
        phase2Tag: "Faza 2", phase2Name: "Weryfikacja",
        phase3Tag: "Konto partnerskie", phase3Name: "Fundly Partner",
        profitTarget: "Cel zysku", maxLossStatic: "Maks. strata (statyczna)", maxLossTrailing: "Maks. strata (ruchoma)",
        maxDailyLoss: "Maks. strata dzienna", timeLimit: "Limit czasu", days30: "30 dni", unlimited: "Bez limitu",
        qualifyingEntries: "Tikiety kwalifikujące", yourShare: "Twój udział", permissibleOdds: "Dopuszczalny zakres kursów",
        pkgSuffix: "pakiet", simCapital: "symulowanego kapitału do dyspozycji",
        f1: "2 fazy oceny", f2: "80% podziału zysku", f3: "Maks. wielkość wpisu", f4: "Nieograniczony czas w fazie partnerskiej", f5: "Dzienny limit straty −4% kapitału",
        oneTime: "jednorazowo", buy: "Kup Challenge",
        note: "Opłata jednorazowa · 30 dni na fazę · brak subskrypcji",
      },
      dashPreview: {
        heading: "Twój panel, stworzony dla przejrzystości", sub: "Saldo w czasie rzeczywistym, aktywne tikiety i statystyki wyników — wszystko w jednym miejscu, bez arkuszy kalkulacyjnych.",
        overview: "Przegląd", liveEntries: "Aktywne tikiety", performance: "Wyniki",
      },
      why: {
        heading: "Dlaczego Fundly?", sub: "Do $100 000 symulowanego kapitału, uczciwe zasady i terminowe wypłaty dla kontrahentów.",
        h1: "Każdy sport. Jedno konto.", p1: "Piłka nożna, hokej, tenis i esport. Kursy symulacyjne od 1.00 do 8.00 w dowolnym sporcie, na którym się znasz najlepiej.",
        h2: "Uczciwe i jasne zasady", p2: "Cele, obsunięcie kapitału i limity znasz jeszcze przed opłatą. Jasny dzienny limit straty −4%, bez drobnego druku.",
        h3: "Przegląd w czasie rzeczywistym", p3: "Śledź postęp swojego challenge'u, limity i nagrody w jednym miejscu, bez arkuszy i zgadywania.",
        h4: "Szybkie wsparcie i wypłaty", p4: "Wsparcie odpowiada w ciągu kilku godzin, a zatwierdzone wynagrodzenia dla kontrahentów są wypłacane w ciągu 48 godzin.",
        bigLbl: "symulowanego kapitału do — ty wnosisz ocenę, my platformę",
        splitLbl: "podziału zysku, na stałe na zawsze", speedLbl: "zatwierdzenie wynagrodzenia",
      },
      comparison: {
        heading: "Ucz się bez ryzyka", sub: "To symulacja — analizujesz prawdziwe dane sportowe, ale nigdy nie ryzykujesz własnego kapitału.",
        tagA: "Ryzykowanie własnego kapitału", entityA: "Na własną rękę", subA: "Prawdziwe pieniądze · prawdziwe ryzyko",
        tagB: "Sposób Fundly", entityB: "Fundly", subB: "Symulowany kapitał · bez potrzeby własnego bankrollu",
        r1a: "Twoje własne pieniądze", r1pill: "Kapitał własny", r1b: "Do <b>$100 000</b> symulowanego kapitału",
        r2a: "Nieograniczone ryzyko", r2pill: "Ryzyko", r2b: "<b>Opłata jednorazowa</b>, nic więcej",
        r3a: "Ograniczony kapitał", r3pill: "Potencjał", r3b: "<b>80%</b> podziału zysku",
        r4a: "Tilt i zgadywanie", r4pill: "Dyscyplina", r4b: "Jasne fazy i zasady",
        r5a: "Sam", r5pill: "Wsparcie", r5b: "Społeczność i wsparcie",
      },
      faq: {
        heading: "Najczęściej zadawane pytania",
        q1: "Czy Fundly Games to bukmacher lub platforma hazardowa?",
        a1: "Nie. Fundly Games to wyłącznie edukacyjna i analityczna platforma symulacyjna. Nie przyjmujemy zakładów, obstawiania ani wpłat na hazard. Wszystkie konta działają wyłącznie w 100% symulowanym środowisku, wykorzystując wirtualne kredyty bez realnej wartości.",
        q2: "Jak działa Challenge?",
        a2: "Challenge składa się z dwóch faz. W pierwszej musisz osiągnąć cel zysku w wysokości 10% kapitału, w drugiej 5%, obie w ciągu 30 dni, przy zachowaniu statycznego limitu maks. straty 10% kapitału i dziennego limitu straty 4% kapitału. W każdej fazie potrzebujesz też co najmniej 5 zwycięskich tikietów symulacyjnych z zyskiem netto co najmniej 0,5% kapitału. Po zaliczeniu obu faz przechodzisz do fazy 3 — konta Fundly Partner bez limitu czasowego i z ruchomym maks. limitem straty 10% od Twojego najwyższego salda.",
        q3: "Jakie są zasady tikietów symulacyjnych?",
        a3: "Możesz składać symulowane tikiety na wszystkie sporty w dopuszczalnym zakresie kursów od 1.00 do 8.00. Maksymalne symulowane ryzyko na tikiet to 1,5% kapitału konta, a w każdej fazie potrzebujesz co najmniej 5 zwycięskich tikietów z zyskiem netto co najmniej 0,5% kapitału, więc wynik nigdy nie zależy od jednego tikietu.",
        q4: "Jak wypłacane są wynagrodzenia za wyniki?",
        a4: "Analitycy, którzy odnieśli sukces w fazie 3, działają jako niezależni kontrahenci B2B. Na podstawie zweryfikowanych danych o wynikach i zasad challenge'u — bufor zysku +5% kapitału i 5 tikietów kwalifikujących, do $4000 na wniosek — kontrahenci przesyłają faktury do Grindit LLC, które są rozliczane przelewem bankowym, kryptoaktywami lub portfelami elektronicznymi w ciągu 48 godzin od zatwierdzenia.",
        q5: "Co jeśli nie zaliczę Challenge?",
        a5: "Tracisz tylko jednorazową opłatę za ocenę, nic więcej. Możesz kupić nowy Challenge w dowolnym momencie i spróbować ponownie — lub zrestartować taniej: opłata za reset to tylko 40% ceny pakietu.",
      },
      cta: {
        heading: "Gotowy, by sprawdzić swoją analitykę?", sub: "Sprawdź swoje umiejętności analityczne. Bez potrzeby własnego bankrollu, liczy się tylko Twoja umiejętność.",
        start: "Rozpocznij Challenge", from: "Od $26", oneTime: "Opłata jednorazowa", support: "Wsparcie 24/7",
      },
      contact: {
        heading: "Skontaktuj się z nami", sub: "Pytania dotyczące pakietu, wypłaty lub konta? Napisz do nas.",
        email: "E-mail", subject: "Temat", subjectPh: "Czego to dotyczy?", message: "Wiadomość", messagePh: "Jak możemy pomóc?", send: "Wyślij wiadomość",
      },
      footer: {
        tagline: "Profesjonalna platforma oceny dla analityków sportowych. Do $100 000 symulowanego kapitału i 80% podziału zysku.",
        packages: "Pakiety", information: "Informacje", support: "Wsparcie",
        contactUs: "Skontaktuj się z nami", telegram: "Czat na Telegramie", status: "Status usługi",
        legal: "Zastrzeżenie prawne: Fundly.games jest prowadzone przez Grindit LLC (Sharjah Media City, Sharjah, ZEA, Reg: 2541536). Fundly Games nie jest bukmacherem, operatorem hazardowym ani instytucją finansową. Wszystkie usługi, wyzwania oceniające i wskaźniki dostarczane na tej platformie służą wyłącznie celom edukacyjnym i symulacji analitycznej, wykorzystując wirtualne kredyty bez wartości pieniężnej. Opłaty za challenge pokrywają licencjonowanie oprogramowania, ocenę danych i dostęp do platformy analitycznej.",
        rights: "© 2026 Fundly. Wszelkie prawa zastrzeżone.",
        privacy: "Prywatność", terms: "Regulamin", rules: "Zasady", disclaimer: "Zastrzeżenie", refund: "Zwrot",
      },
      auth: {
        login: "Zaloguj się", loginSub: "Zaloguj się do swojego konta", email: "E-mail", password: "Hasło",
        forgot: "Zapomniałeś hasła?", noAccount: "Nie masz jeszcze konta?", signUp: "Zarejestruj się",
      },
    },
  };

  const SUPPORTED = ["en", "cs", "es", "pl"];
  const STORAGE_KEY = "fundly:lang";
  const GEO_CACHE_KEY = "fundly:geoLang";

  function resolve(dict, path) {
    return path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), dict);
  }

  function t(path) {
    const lang = getLang();
    return resolve(DICT[lang], path) ?? resolve(DICT.en, path) ?? path;
  }

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || document.documentElement.dataset.lang || "en";
  }

  function applyTranslations(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
    document.querySelectorAll(".lang-switch [data-lang]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
    document.dispatchEvent(new CustomEvent("fundly:lang-changed", { detail: { lang } }));
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    localStorage.setItem(STORAGE_KEY, lang);
    applyTranslations(lang);
  }

  // Geo-IP auto-detect: only runs once (cached) and only if the visitor
  // never picked a language manually. Best-effort — any failure (network,
  // ad-blocker, privacy extension) just leaves the page in English.
  function countryToLang(cc) {
    if (!cc) return null;
    if (cc === "CZ" || cc === "SK") return "cs";
    if (cc === "PL") return "pl";
    const ES_COUNTRIES = ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "BO", "DO", "HN", "PY", "SV", "NI", "CR", "PA", "UY", "GQ"];
    if (ES_COUNTRIES.includes(cc)) return "es";
    return null;
  }

  async function detectAndApply() {
    if (localStorage.getItem(STORAGE_KEY)) {
      applyTranslations(getLang());
      return;
    }
    const cached = localStorage.getItem(GEO_CACHE_KEY);
    if (cached) {
      applyTranslations(cached);
      return;
    }
    applyTranslations("en"); // render immediately, upgrade below if geo-IP resolves
    try {
      const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return;
      const data = await res.json();
      const lang = countryToLang(data.country_code) || "en";
      localStorage.setItem(GEO_CACHE_KEY, lang);
      if (lang !== "en") applyTranslations(lang);
    } catch (e) {
      // geo-IP unavailable — stay on English, no error surfaced to the user
    }
  }

  detectAndApply();

  // Switcher: works for any [data-lang] button inside .lang-switch, delegated
  // so it keeps working even though applyTranslations() re-renders content.
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".lang-switch [data-lang]");
    if (btn) setLang(btn.dataset.lang);
  });

  return { t, setLang, getLang, SUPPORTED };
})();

const t = FUNDLY_I18N.t;
window.t = t;
window.FUNDLY_I18N = FUNDLY_I18N;
