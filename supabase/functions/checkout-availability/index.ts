// checkout-availability — veřejný endpoint pro checkout.html: kolik z prvních
// LAUNCH_CAPACITY kupujících je ještě volných. Bez LAUNCH_CAPACITY (secrets set)
// vrací { capped: false } → checkout běží bez omezení (zpětná kompatibilita).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCors, jsonResponse } from "../_shared/cors.ts";
import { launchCapacity, soldCount } from "../_shared/capacity.ts";

serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const cap = launchCapacity();
  if (cap === null) return jsonResponse({ capped: false });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const sold = await soldCount(supabase);
    return jsonResponse({
      capped: true,
      cap,
      sold,
      spotsLeft: Math.max(0, cap - sold),
      soldOut: sold >= cap,
    });
  } catch (err) {
    console.error("checkout-availability error:", err);
    // Chyba čtení nesmí zablokovat checkout — chováme se, jako by limit nebyl.
    return jsonResponse({ capped: false });
  }
});
