// =============================================================================
// LeadGenRentalsHQ - Verify Cloudflare Turnstile Token
// =============================================================================
// Lightweight endpoint that validates a Turnstile CAPTCHA token server-side.
// Used by the login form (which calls Supabase Auth SDK directly and has no
// other edge function to piggyback on).
//
// Payload: { cf_turnstile_response: string }
// Returns: { success: true } or 403
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { cf_turnstile_response } = await req.json();

    if (!cf_turnstile_response || typeof cf_turnstile_response !== "string") {
      return jsonResponse({ error: "CAPTCHA token is required." }, 400);
    }

    const secret = Deno.env.get("CF_TURNSTILE_SECRET");
    if (!secret) {
      console.error("CF_TURNSTILE_SECRET is not set");
      return jsonResponse({ error: "CAPTCHA service is not configured." }, 503);
    }

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: cf_turnstile_response }),
      },
    );
    const data = await res.json();

    if (data.success !== true) {
      return jsonResponse({ error: "CAPTCHA verification failed." }, 403);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("verify-turnstile error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
