// ============================================================================
// verify-sms — Twilio Verify SMS OTP for the LGR landing-page survey.
//
// Two actions:
//   POST { action: "start", phone }         → sends a 6-digit SMS code
//        → { success: true, status: "pending" }
//   POST { action: "check", phone, code }   → checks the code the user entered
//        → { success: true, approved: true|false, status }
//
// Keeps junk/invalid numbers out of the funnel: the survey calls "start" when
// the homeowner enters their mobile, then "check" before it fires submit-lead.
//
// Phone is normalised to E.164 (+61…) so it matches what submit-lead stores.
//
// Secrets (set in Supabase → Edge Functions → verify-sms):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID
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

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const service = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");
  if (!sid || !token || !service) {
    return json({ error: "verify not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_VERIFY_SERVICE_SID missing)" }, 500);
  }
  const auth = "Basic " + btoa(sid + ":" + token);

  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").toString();
    const phone = normalisePhone((body.phone || "").toString());
    if (!phone) return json({ error: "invalid_phone" }, 400);

    if (action === "start") {
      const params = new URLSearchParams({ To: phone, Channel: "sms" });
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${service}/Verifications`,
        { method: "POST", headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: "verify_start_failed", detail: data?.message || res.statusText }, 502);
      return json({ success: true, status: data.status || "pending" });
    }

    if (action === "check") {
      const code = (body.code || "").toString().trim();
      if (!/^\d{4,8}$/.test(code)) return json({ error: "invalid_code" }, 400);
      const params = new URLSearchParams({ To: phone, Code: code });
      const res = await fetch(
        `https://verify.twilio.com/v2/Services/${service}/VerificationCheck`,
        { method: "POST", headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" }, body: params.toString() },
      );
      const data = await res.json().catch(() => ({}));
      // Twilio returns 404 when the code expired / no pending verification.
      if (!res.ok && res.status !== 404) return json({ error: "verify_check_failed", detail: data?.message || res.statusText }, 502);
      const approved = data.status === "approved";
      return json({ success: true, approved, status: data.status || "expired" });
    }

    return json({ error: "unknown_action", detail: "action must be 'start' or 'check'" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
