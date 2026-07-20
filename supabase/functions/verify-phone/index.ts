// ============================================================================
// verify-phone — real-time phone validation via the Veriphone API
// (https://veriphone.io). Replaces the old SMS OTP: instead of texting a code we
// check, server-side, that the number actually exists and is a mobile.
//
// submit-lead runs this same check inline as its hard anti-spam block, so this
// standalone function is for anywhere else that wants a quick "is this a real
// mobile?" answer (e.g. inline field validation on a form).
//
//   POST { phone }  →  { valid, mobile, type, carrier, region, e164 }
//
// Secrets: VERIPHONE_API_KEY  (set in Supabase → Edge Functions → verify-phone).
// ============================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normalise an AU phone number to E.164 (+61…). Returns null if not valid AU.
function normalisePhone(raw: string): string | null {
  let p = (raw || "").replace(/[\s\-().]/g, "");
  if (p.startsWith("0") && p.length === 10) p = "+61" + p.slice(1);
  else if (p.startsWith("61") && !p.startsWith("+") && p.length === 11) p = "+" + p;
  if (/^\+61[2-9][0-9]{8}$/.test(p)) return p;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const key = Deno.env.get("VERIPHONE_API_KEY");
  if (!key) return json({ error: "verify not configured (VERIPHONE_API_KEY missing)" }, 500);

  try {
    const body = await req.json().catch(() => ({}));
    const phone = normalisePhone((body.phone || "").toString());
    if (!phone) return json({ valid: false, mobile: false, type: "invalid", reason: "not_au_format" });

    const url = `https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(phone)}&key=${key}&default_country=AU`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return json({ error: "veriphone_error", status: res.status }, 502);

    const d = await res.json();
    const type = String(d.phone_type || "");
    const valid = d.phone_valid === true;
    const mobile = type === "mobile" || type === "fixed_line_or_mobile";
    return json({
      valid,
      mobile,
      type,
      carrier: d.carrier || null,
      region: d.phone_region || null,
      e164: d.e164 || phone,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
