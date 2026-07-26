// Sends a sample lead.created payload to one of the caller's own webhook
// endpoints so they can confirm their integration works before real leads flow.
// Signs with HMAC-SHA256 when the endpoint has a secret; delivers unsigned
// otherwise. Logs the attempt to webhook_deliveries like a real delivery.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth header" }, 401);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorised" }, 401);

    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) return json({ error: "No company found for user" }, 403);
    const companyId = profile.company_id;

    const { webhook_id } = await req.json().catch(() => ({})) as { webhook_id?: string };
    if (!webhook_id) return json({ error: "webhook_id is required" }, 400);

    // Load the endpoint and confirm it belongs to the caller's company.
    const { data: ep } = await db
      .from("webhook_endpoints")
      .select("id, url, secret, company_id")
      .eq("id", webhook_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!ep) return json({ error: "Webhook not found" }, 404);

    const event = "lead.created";
    const bodyObj = {
      event,
      timestamp: new Date().toISOString(),
      test: true,
      data: {
        id: "00000000-0000-0000-0000-000000000000",
        name: "Test Lead",
        first_name: "Test",
        last_name: "Lead",
        email: "test.lead@example.com",
        phone: "+61400000000",
        postcode: "2000",
        company: "Sample Co",
        pipeline_stage: "new_lead",
        source: "Webhook Test",
        created_at: new Date().toISOString(),
      },
    };
    const body = JSON.stringify(bodyObj);

    // Sign only when a secret is configured (mirrors the real delivery paths).
    let signature: string | null = null;
    if (ep.secret) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(ep.secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
      signature = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }

    let success = false;
    let responseStatus = 0;
    let responseBody = "";
    try {
      const res = await fetch(ep.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": event,
          "X-Webhook-Test": "true",
          ...(signature ? { "X-Webhook-Signature": signature } : {}),
        },
        body,
      });
      responseStatus = res.status;
      responseBody = (await res.text()).slice(0, 1000);
      success = res.ok;
    } catch (err) {
      responseBody = `${(err as Error).name}: ${(err as Error).message}`;
    }

    await db.from("webhook_deliveries").insert({
      webhook_id: ep.id,
      company_id: companyId,
      event,
      payload: bodyObj,
      response_status: responseStatus,
      response_body: responseBody,
      success,
    });

    return json({
      ok: success,
      response_status: responseStatus,
      signed: !!signature,
      response_preview: responseBody.slice(0, 300),
    });
  } catch (err) {
    console.error("test-webhook error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
