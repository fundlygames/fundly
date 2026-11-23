/* league-names.js — české / slovenské názvy soutěží, jak je lidé znají od Tipsportu a Fortuny
   („1. anglická liga“, „Liga mistrů“, „Chance Liga“…). odds-api posílá anglické názvy
   („England - Premier League“); interně (filtry, řazení, tikety) zůstávají beze změny, překládá se
   jen to, co se ukáže. Neznámá soutěž = původní název. Jen cs a sk, ostatní jazyky beze změny.

   FundlyLeagues.display(name) → název pro aktuální jazyk */
(function () {
  // země → [cs přídavné jméno, sk přídavné jméno]
  const ADJ = {
    England: ["anglická", "anglická"], Spain: ["španělská", "španielska"], Germany: ["německá", "nemecká"],
    Italy: ["italská", "talianska"], France: ["francouzská", "francúzska"], Netherlands: ["nizozemská", "holandská"],
    Portugal: ["portugalská", "portugalská"], Czechia: ["česká", "česká"], Slovakia: ["slovenská", "slovenská"],
    Poland: ["polská", "poľská"], Austria: ["rakouská", "rakúska"], Switzerland: ["švýcarská", "švajčiarska"],
    Scotland: ["skotská", "škótska"], Belgium: ["belgická", "belgická"], Turkiye: ["turecká", "turecká"],
    Greece: ["řecká", "grécka"], Denmark: ["dánská", "dánska"], Croatia: ["chorvatská", "chorvátska"],
    Sweden: ["švédská", "švédska"], Norway: ["norská", "nórska"], Romania: ["rumunská", "rumunská"],
    Hungary: ["maďarská", "maďarská"], Russia: ["ruská", "ruská"], Brazil: ["brazilská", "brazílska"],
    Argentina: ["argentinská", "argentínska"], Japan: ["japonská", "japonská"], Ukraine: ["ukrajinská", "ukrajinská"],
    Serbia: ["srbská", "srbská"], Slovenia: ["slovinská", "slovinská"], Finland: ["finská", "fínska"],
    "Saudi Arabia": ["saúdskoarabská", "saudskoarabská"], USA: ["americká", "americká"],
    "Northern Ireland": ["severoirská", "severoírska"], Egypt: ["egyptská", "egyptská"], Chile: ["chilská", "čílska"],
    Australia: ["australská", "austrálska"], Belarus: ["běloruská", "bieloruská"], Kazakhstan: ["kazachstánská", "kazašská"],
    "Republic of Korea": ["jihokorejská", "juhokórejská"],
  };
  // fotbal: soutěž → [země, úroveň] → „1. anglická liga“
  const TIER = {
    "England - Premier League": ["England", 1], "England - Championship": ["England", 2],
    "England - League One": ["England", 3], "England - League Two": ["England", 4], "England - National League": ["England", 5],
    "Spain - LaLiga": ["Spain", 1], "Spain - LaLiga 2": ["Spain", 2],
    "Germany - Bundesliga": ["Germany", 1], "Germany - 2. Bundesliga": ["Germany", 2], "Germany - 3. Liga": ["Germany", 3],
    "Italy - Serie A": ["Italy", 1], "Italy - Serie B": ["Italy", 2],
    "France - Ligue 1": ["France", 1], "France - Ligue 2": ["France", 2],
    "Netherlands - Eredivisie": ["Netherlands", 1], "Netherlands - Eerste Divisie": ["Netherlands", 2],
    "Portugal - Liga Portugal": ["Portugal", 1], "Portugal - Liga Portugal 2": ["Portugal", 2],
    "Slovakia - Superliga": ["Slovakia", 1],
    "Poland - Ekstraklasa": ["Poland", 1], "Poland - 1. Liga": ["Poland", 2],
    "Austria - Bundesliga": ["Austria", 1], "Austria - 2. Liga": ["Austria", 2],
    "Switzerland - Super League": ["Switzerland", 1], "Switzerland - Challenge League": ["Switzerland", 2],
    "Scotland - Premiership": ["Scotland", 1], "Scotland - Championship": ["Scotland", 2],
    "Scotland - League One": ["Scotland", 3], "Scotland - League Two": ["Scotland", 4],
    "Belgium - First Division A": ["Belgium", 1], "Turkiye - Super Lig": ["Turkiye", 1], "Turkiye - 1. Lig": ["Turkiye", 2],
    "Greece - Super League": ["Greece", 1], "Denmark - Superligaen": ["Denmark", 1], "Denmark - 1st Division": ["Denmark", 2],
    "Croatia - HNL": ["Croatia", 1], "Sweden - Allsvenskan": ["Sweden", 1], "Norway - Eliteserien": ["Norway", 1],
    "Romania - Superliga": ["Romania", 1], "Romania - Liga 2": ["Romania", 2], "Hungary - NB I": ["Hungary", 1],
    "Russia - Premier League": ["Russia", 1], "Brazil - Brasileiro Serie A": ["Brazil", 1],
    "Argentina - Liga Profesional": ["Argentina", 1], "Japan - J.League": ["Japan", 1], "Japan - J.League 2": ["Japan", 2],
    "Ukraine - Premier League": ["Ukraine", 1], "Serbia - Super Liga": ["Serbia", 1], "Slovenia - PrvaLiga": ["Slovenia", 1],
    "Saudi Arabia - Saudi Professional League": ["Saudi Arabia", 1], "Saudi Arabia - Division 1": ["Saudi Arabia", 2],
    "Northern Ireland - Premiership": ["Northern Ireland", 1], "Egypt - Premier League": ["Egypt", 1],
    "Chile - Primera Division": ["Chile", 1], "Australia - A-League": ["Australia", 1],
    "Belarus - Vysshaya League": ["Belarus", 1],
  };
  // ostatní: [cs, sk]
  const FIXED = {
    "Czechia - 1. Liga": ["Chance Liga", "Chance Liga (CZ)"],
    "Czechia - Czech Cup": ["Český pohár", "Český pohár"],
    "International Clubs - UEFA Champions League": ["Liga mistrů", "Liga majstrov"],
    "International Clubs - UEFA Europa League": ["Evropská liga", "Európska liga"],
    "International Clubs - UEFA Conference League": ["Konferenční liga", "Konferenčná liga"],
    "Germany - DFB Pokal": ["Německý pohár", "Nemecký pohár"], "Italy - Coppa Italia": ["Italský pohár", "Taliansky pohár"],
    "Spain - Copa del Rey": ["Španělský pohár", "Španielsky pohár"], "England - FA Cup": ["Anglický pohár (FA Cup)", "Anglický pohár (FA Cup)"],
    "England - EFL Cup": ["Anglický ligový pohár", "Anglický ligový pohár"], "Poland - Puchar Polski": ["Polský pohár", "Poľský pohár"],
    "USA - MLS": ["MLS", "MLS"], "USA - MLS, Playoffs": ["MLS · play-off", "MLS · play-off"],
    // hokej
    "Czechia - Extraliga": ["Extraliga (hokej)", "Česká extraliga (hokej)"],
    "Czechia - 1st Liga": ["1. česká hokejová liga", "1. česká hokejová liga"],
    "Slovakia - Extraliga": ["Slovenská extraliga", "Slovenská extraliga"],
    "USA - NHL": ["NHL", "NHL"], "Russia - KHL": ["KHL", "KHL"], "USA - AHL": ["AHL", "AHL"],
    "Finland - Liiga": ["Finská liga", "Fínska liga"], "Germany - DEL": ["Německá liga (DEL)", "Nemecká liga (DEL)"],
    "Switzerland - National League": ["Švýcarská liga", "Švajčiarska liga"], "Sweden - SHL": ["Švédská liga (SHL)", "Švédska liga (SHL)"],
    "Austria - ICE Hockey League": ["Rakouská ICE liga", "Rakúska ICE liga"],
    // basketbal
    "USA - NBA": ["NBA", "NBA"], "International - Euroleague": ["Euroliga", "Euroliga"], "Czechia - NBL": ["Česká NBL", "Česká NBL"],
  };
  // Místo konání velkých turnajů (odds-api ho nedává) — klíč = název soutěže z odds-api.
  // Doplňuje se ručně a JEN z ověřených zdrojů (web pořadatele / ESPN), ať tu nic nevymýšlíme.
  //   Oktagon 99: oktagonmma.com (5. 12. 2026, Westfalenhalle Dortmund)
  //   UFC FN Adesanya vs. Magomedov: ESPN fightcenter / bet365 news (5. 12. 2026, ANB Arena Rijád)
  const VENUES = {
    "Oktagon - Oktagon 99": { venue: "Westfalenhalle", city: ["Dortmund, Německo", "Dortmund, Nemecko", "Dortmund, Germany"] },
    "UFC - UFC Fight Night: Adesanya vs. Magomedov": { venue: "ANB Arena", city: ["Rijád, Saúdská Arábie", "Rijád, Saudská Arábia", "Riyadh, Saudi Arabia"] },
  };
  function venue(name) {
    const v = VENUES[name];
    if (!v) return null;
    const l = lang();
    return `${v.venue} · ${v.city[l === "cs" ? 0 : l === "sk" ? 1 : 2]}`;
  }
  function lang() { try { return FUNDLY_I18N.getLang(); } catch (e) { return "en"; } }
  function display(name) {
    if (!name) return name;
    const l = lang();
    const i = l === "cs" ? 0 : l === "sk" ? 1 : -1;
    if (i < 0) return name;
    if (FIXED[name]) return FIXED[name][i];
    const t = TIER[name];
    if (t && ADJ[t[0]]) return `${t[1]}. ${ADJ[t[0]][i]} liga`;
    return name;
  }
  window.FundlyLeagues = { display, venue };
})();
