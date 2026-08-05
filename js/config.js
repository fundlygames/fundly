/* Fundly — konfigurace backendu (Supabase + Whop).
   Anon klíč je bezpečné zveřejnit — data chrání Row Level Security v databázi
   a citlivé operace obstarávají edge funkce se service role klíčem.
   PLACEHOLDER hodnoty se nahradí skutečnými při nasazení — viz docs/WHOP-SETUP.md. */

const FUNDLY_SUPABASE_URL = "https://siruaytogfsgujpwzcsb.supabase.co";
const FUNDLY_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpcnVheXRvZ2ZzZ3VqcHd6Y3NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NDc0NjcsImV4cCI6MjEwMTUyMzQ2N30.Ba7wOT_qh2Z69c3h77dC0n3_nux4Wj0vXPREGsjQLw8";

// Dokud nejsou placeholdery nahrazené, běží web v čistě lokálním (demo) režimu.
function fundlyBackendEnabled() {
  return (
    !FUNDLY_SUPABASE_URL.includes("PLACEHOLDER") &&
    !FUNDLY_SUPABASE_ANON_KEY.includes("PLACEHOLDER")
  );
}
