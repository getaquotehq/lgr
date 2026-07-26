// =============================================================================
// LeadGenRentalsHQ - Demo Request (public landing page form)
// =============================================================================
// Validates Cloudflare Turnstile token, then inserts a demo_request row.
//
// Payload: { name, email, phone?, company?, cf_turnstile_response }
// No auth required - this is a public endpoint.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = Deno.env.get("CF_TURNSTILE_SECRET");
  if (!secret) {
    console.error("CF_TURNSTILE_SECRET is not set");
    return false;
  }
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    },
  );
  const data = await res.json();
  return data.success === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { name, email, phone, company, cf_turnstile_response } =
      await req.json();

    // ── Validate fields ───────────────────────────────────────────────────
    if (!name || typeof name !== "string") {
      return jsonResponse({ error: "Name is required." }, 400);
    }
    if (!email || typeof email !== "string") {
      return jsonResponse({ error: "Email is required." }, 400);
    }

    // ── Verify Turnstile ──────────────────────────────────────────────────
    if (!cf_turnstile_response || typeof cf_turnstile_response !== "string") {
      return jsonResponse({ error: "CAPTCHA verification is required." }, 400);
    }
    const turnstileOk = await verifyTurnstile(cf_turnstile_response);
    if (!turnstileOk) {
      return jsonResponse({ error: "CAPTCHA verification failed. Please try again." }, 403);
    }

    // ── Insert into database ──────────────────────────────────────────────
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: insertError } = await adminClient
      .from("demo_requests")
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        company: company?.trim() || null,
      });

    if (insertError) {
      console.error("demo_requests insert error:", insertError.message);
      return jsonResponse({ error: "Failed to submit request. Please try again." }, 500);
    }

    return jsonResponse({ success: true }, 200);
  } catch (err) {
    console.error("demo-request error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
