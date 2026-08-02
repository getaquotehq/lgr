// ============================================================================
// trial-quick-capture: public, no-auth endpoint for the low-commitment
// "leave your email" capture on solar-trial.html - for visitors who check
// trade/area availability but don't complete the $550 trial checkout.
//
// Distinct from intake-sales-lead (which requires a shared secret and is
// meant for server-to-server callers like Zapier/Make) - this one is safe to
// call directly from public page JS since it takes no secret, just an email
// plus whatever trade/area context the page already has.
//
// Request: POST { email, trade?, area?, business_name? }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// LGR's own house company - same one the Sales Pipeline panel in mc/app.html reads.
const LGR_INTERNAL_COMPANY_ID = "257a6ce5-e8b8-4086-8f7d-761e9d23826d";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const { email, trade, area, business_name } = body as Record<string, unknown>;
    const resolvedEmail = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    if (!resolvedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedEmail)) {
      return json({ success: false, error: "A valid email is required" }, 400);
    }

    const resolvedName =
      typeof business_name === "string" && business_name.trim()
        ? business_name.trim()
        : resolvedEmail.split("@")[0];

    const custom_data: Record<string, unknown> = {};
    if (typeof trade === "string" && trade.trim()) custom_data.trade = trade.trim();
    if (typeof area === "string" && area.trim()) custom_data.area = area.trim();

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadErr } = await db
      .from("leads")
      .insert({
        company_id: LGR_INTERNAL_COMPANY_ID,
        name: resolvedName,
        email: resolvedEmail,
        source: "Trial page - quick capture",
        pipeline_stage: "new_lead",
        ai_enabled: false,
        ...(Object.keys(custom_data).length > 0 ? { custom_data } : {}),
      })
      .select("id")
      .single();

    if (leadErr || !lead) {
      console.error("trial-quick-capture insert error:", leadErr);
      return json({ success: false, error: "Failed to save" }, 500);
    }

    return json({ success: true });
  } catch (err) {
    console.error("trial-quick-capture error:", err);
    return json({ success: false, error: "Internal server error" }, 500);
  }
});
