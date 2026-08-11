// _shared/settle.ts — server-side vyhodnocení výběru tiketu, 1:1 port
// settleSelection() z js/portfolio.js. MUSÍ zůstat identické s klientem,
// jinak by se stejný tiket mohl vyhodnotit jinak podle toho, kdo ho vyřídil
// první (klient při otevřeném dashboardu, nebo tenhle cron).
export type Selection = {
  marketName: string | null;
  field: string | null;
  hdp?: number | null;
};

export function settleSelection(sel: Selection, finalHome: number, finalAway: number): "won" | "lost" | "push" {
  const total = finalHome + finalAway;
  switch (sel.marketName) {
    case "ML": {
      if (finalHome === finalAway) return sel.field === "draw" ? "won" : "lost";
      const winner = finalHome > finalAway ? "home" : "away";
      return sel.field === winner ? "won" : "lost";
    }
    case "Totals":
    case "Goals Over/Under": {
      if (sel.hdp == null) return "push";
      if (total === sel.hdp) return "push";
      const over = total > sel.hdp;
      if (sel.field === "over") return over ? "won" : "lost";
      if (sel.field === "under") return !over ? "won" : "lost";
      return "push";
    }
    case "Both Teams To Score": {
      const btts = finalHome > 0 && finalAway > 0;
      if (sel.field === "yes") return btts ? "won" : "lost";
      if (sel.field === "no") return !btts ? "won" : "lost";
      return "push";
    }
    case "Spread": {
      if (sel.hdp == null) return "push";
      const adjHome = finalHome + sel.hdp;
      if (adjHome === finalAway) return "push";
      const winner = adjHome > finalAway ? "home" : "away";
      return sel.field === winner ? "won" : "lost";
    }
    default:
      return "push";
  }
}
