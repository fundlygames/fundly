// _shared/email.ts — volitelné odesílání transakčních e-mailů přes Resend.
// Bez RESEND_API_KEY (secrets set) tiše přeskočí — nic to neblokuje, jen se
// e-mail neodešle (stejný vzor jako meta-ads-spend bez Meta klíčů).
// Nastavení: supabase secrets set RESEND_API_KEY=re_... RESEND_FROM="Fundly <support@fundly.games>"
// (RESEND_FROM musí být na ověřené doméně v Resend účtu, jinak Resend odešle jen na váš vlastní e-mail).

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  const from = Deno.env.get("RESEND_FROM") ?? "Fundly <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: params.to, subject: params.subject, html: params.html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Resend HTTP ${res.status}: ${body}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function supportReplyHtml(originalMessage: string, reply: string): string {
  return `
  <div style="background:#020204;padding:32px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#e8e8ec">
    <div style="max-width:520px;margin:0 auto;background:#0d0d12;border:1px solid #ffffff1a;border-radius:16px;padding:28px">
      <div style="color:#14f195;font-weight:700;font-size:18px;margin-bottom:16px">fundly</div>
      <h2 style="color:#fff;font-size:18px;margin:0 0 12px">Reply to your message</h2>
      <p style="color:#a0a0ab;font-size:14px;line-height:1.6;white-space:pre-wrap">${reply.replace(/</g, "&lt;")}</p>
      <hr style="border:none;border-top:1px solid #ffffff1a;margin:20px 0" />
      <p style="color:#5a5a66;font-size:12px;margin:0 0 6px">Your original message:</p>
      <p style="color:#7a7a86;font-size:13px;line-height:1.5;white-space:pre-wrap">${originalMessage.replace(/</g, "&lt;")}</p>
    </div>
  </div>`;
}
