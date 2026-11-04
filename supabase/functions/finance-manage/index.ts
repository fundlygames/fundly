// finance-manage — admin.html: investoři (přístupové odkazy) a náklady.
// POST (admin JWT nebo x-admin-key) { action, ... }:
//   investors_list | investor_create {name,email?,note?} | investor_update {id,name?,email?,note?,active?}
//   | investor_regenerate {id} | investor_delete {id}
//   expenses_list | expense_create {entry_date,kind,label?,amount,currency,note?} | expense_update {id,…} | expense_delete {id}
//   pnl  → čistý zisk (stejná čísla, jaká vidí investoři)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { isAdminRequest } from "../_shared/admin.ts";
import { CURRENCIES, fxRates, toUsd } from "../_shared/fx.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://fundly.games";
const KINDS = ["marketing", "software", "payroll", "legal", "other"];

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const link = (token: string) => `${SITE_URL}/investors?k=${token}`;
const clip = (v: unknown, n: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, n) : null; };

// deno-lint-ignore no-explicit-any
function parseExpense(b: any) {
  const entry_date = String(b.entry_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry_date) || Number.isNaN(new Date(entry_date).getTime())) throw new Error("Neplatné datum.");
  const kind = String(b.kind ?? "marketing");
  if (!KINDS.includes(kind)) throw new Error("Neplatná kategorie.");
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) throw new Error("Neplatná částka.");
  const currency = String(b.currency ?? "USD").toUpperCase();
  if (!(CURRENCIES as readonly string[]).includes(currency)) throw new Error("Neplatná měna.");
  return { entry_date, kind, label: clip(b.label, 80), amount, currency, amount_usd: toUsd(amount, currency), note: clip(b.note, 300), updated_at: new Date().toISOString() };
}

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!(await isAdminRequest(req))) return jsonResponse({ error: "Nemáte oprávnění." }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---------- investoři ----------
    if (action === "investors_list") {
      const { data, error } = await supabase.from("investor_accounts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return jsonResponse({ ok: true, investors: (data ?? []).map((i) => ({ ...i, link: link(i.token) })) });
    }
    if (action === "investor_create") {
      const name = clip(body.name, 80);
      if (!name) return jsonResponse({ error: "Zadejte jméno." }, 400);
      const token = newToken();
      const { data, error } = await supabase.from("investor_accounts")
        .insert({ name, email: clip(body.email, 120), note: clip(body.note, 300), token }).select("*").single();
      if (error) throw error;
      return jsonResponse({ ok: true, investor: { ...data, link: link(data.token) } });
    }
    if (action === "investor_update") {
      const patch: Record<string, unknown> = {};
      if (body.name !== undefined) { const n = clip(body.name, 80); if (!n) return jsonResponse({ error: "Zadejte jméno." }, 400); patch.name = n; }
      if (body.email !== undefined) patch.email = clip(body.email, 120);
      if (body.note !== undefined) patch.note = clip(body.note, 300);
      if (body.active !== undefined) patch.active = body.active === true;
      const { data, error } = await supabase.from("investor_accounts").update(patch).eq("id", String(body.id ?? "")).select("*").single();
      if (error) throw error;
      return jsonResponse({ ok: true, investor: { ...data, link: link(data.token) } });
    }
    if (action === "investor_regenerate") {
      const { data, error } = await supabase.from("investor_accounts").update({ token: newToken(), views: 0, last_viewed_at: null })
        .eq("id", String(body.id ?? "")).select("*").single();
      if (error) throw error;
      return jsonResponse({ ok: true, investor: { ...data, link: link(data.token) } });
    }
    if (action === "investor_delete") {
      const { error } = await supabase.from("investor_accounts").delete().eq("id", String(body.id ?? ""));
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // ---------- náklady ----------
    if (action === "expenses_list") {
      const { data, error } = await supabase.from("finance_entries").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      const rows = data ?? [];
      const total = rows.reduce((a, r) => a + Number(r.amount_usd || 0), 0);
      const byKind: Record<string, number> = {};
      for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + Number(r.amount_usd || 0);
      return jsonResponse({ ok: true, expenses: rows, total_usd: Math.round(total * 100) / 100, by_kind: byKind });
    }
    if (action === "expense_create") {
      const { data, error } = await supabase.from("finance_entries").insert(parseExpense(body)).select("*").single();
      if (error) throw error;
      return jsonResponse({ ok: true, expense: data });
    }
    if (action === "expense_update") {
      const { data, error } = await supabase.from("finance_entries").update(parseExpense(body)).eq("id", String(body.id ?? "")).select("*").single();
      if (error) throw error;
      return jsonResponse({ ok: true, expense: data });
    }
    if (action === "expense_delete") {
      const { error } = await supabase.from("finance_entries").delete().eq("id", String(body.id ?? ""));
      if (error) throw error;
      return jsonResponse({ ok: true });
    }

    // ---------- čistý zisk (shodně s tím, co vidí investoři) ----------
    if (action === "pnl") {
      const fx = fxRates();
      const { data, error } = await supabase.rpc("investor_stats", { p_eur: fx.eur, p_czk: fx.czk, p_gbp: fx.gbp, p_pln: fx.pln });
      if (error) throw error;
      // deno-lint-ignore no-explicit-any
      const s: any = typeof data === "string" ? JSON.parse(data) : data;
      const net = Number(s.revenue.net_of_fees) || 0;
      const costs = Number(s.costs.total) || 0;
      const payouts = Number(s.costs.partner_payouts_paid) || 0;
      return jsonResponse({
        ok: true,
        gross: Number(s.revenue.gross) || 0, net_revenue: net, costs, marketing: Number(s.costs.marketing) || 0, payouts,
        net_profit: Math.round((net - costs - payouts) * 100) / 100, by_month: s.revenue.by_month, rates: fx,
      });
    }

    return jsonResponse({ error: "Neznámá akce." }, 400);
  } catch (err) {
    console.error("finance-manage error:", err);
    // deno-lint-ignore no-explicit-any
    const msg = err instanceof Error ? err.message : (err as any)?.message;
    // chyby z parseExpense (neplatné datum/částka/kategorie/měna) jsou chyby zadání, ne serveru
    return jsonResponse({ error: msg || "Požadavek se nezdařil." }, /^Neplatn/.test(String(msg)) ? 400 : 500);
  }
});
