// =============================================================================
// LeadGenRentalsHQ - Public Quote Viewer
// =============================================================================
// Unauthenticated edge function for external quote recipients.
//
// GET  ?token=<quote_token>           → Returns quote JSON + marks viewed_at
// POST { token, action: "accept" }    → Marks quote as accepted
// POST { token, action: "decline" }   → Marks quote as declined
//
// No auth required - uses service role internally.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Outbound webhook helper ───────────────────────────────────────────────────
// Fire-and-forget: looks up active webhook_endpoints for the company,
// filters by event, signs the payload with HMAC-SHA256, delivers, and logs.
async function fireWebhooks(
  db: ReturnType<typeof createClient>,
  companyId: string,
  event: string,
  payload: unknown,
) {
  try {
    const { data: endpoints } = await db
      .from("webhook_endpoints")
      .select("id, url, secret, events")
      .eq("company_id", companyId)
      .eq("active", true);
    if (!endpoints || endpoints.length === 0) return;
    for (const ep of endpoints) {
      const events = Array.isArray(ep.events) ? ep.events : [];
      if (!events.includes(event)) continue;
      const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
      // Sign only when a secret is configured; a secret-less endpoint still
      // receives the event, just without the X-Webhook-Signature header.
      let signature: string | null = null;
      if (ep.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(ep.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        signature = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      (async () => {
        let success = false, responseStatus = 0, responseBody = "";
        try {
          const res = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Event": event, ...(signature ? { "X-Webhook-Signature": signature } : {}) }, body });
          responseStatus = res.status; responseBody = (await res.text()).slice(0, 1000); success = res.ok;
        } catch (err) { responseBody = `${(err as Error).name}: ${(err as Error).message}`; }
        await db.from("webhook_deliveries").insert({ webhook_id: ep.id, company_id: companyId, event, payload: JSON.parse(body), response_status: responseStatus, response_body: responseBody, success });
      })();
    }
  } catch (err) { console.error("fireWebhooks error:", err); }
}



Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ─── GET: View quote by token ──────────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = url.searchParams.get("token");
      if (!token) {
        return new Response(JSON.stringify({ error: "token required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: quote, error } = await db
        .from("quotes")
        .select("id, quote_number, status, subtotal, tax, total, valid_until, notes, line_items, metadata, sent_at, viewed_at, accepted_at, created_at, lead_id, company_id")
        .eq("quote_token", token)
        .single();

      if (error || !quote) {
        return new Response(JSON.stringify({ error: "Quote not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fetch company info for display
      const { data: company } = await db
        .from("companies")
        .select("name, logo_url, email, phone")
        .eq("id", quote.company_id)
        .single();

      // Fetch lead info
      const { data: lead } = await db
        .from("leads")
        .select("name, email, phone")
        .eq("id", quote.lead_id)
        .single();

      // Mark as viewed (first view only)
      if (!quote.viewed_at) {
        const viewUpdate: { viewed_at: string; status?: string } = { viewed_at: new Date().toISOString() };
        if (quote.status === "sent") {
          viewUpdate.status = "viewed";
        }
        await db
          .from("quotes")
          .update(viewUpdate)
          .eq("id", quote.id);

        // Log activity
        await db.from("activity_log").insert({
          company_id: quote.company_id,
          action: "quote.viewed",
          entity_type: "quote",
          entity_id: quote.id,
          details: { quote_number: quote.quote_number, viewed_via: "public_link" },
        });
      }

      return new Response(JSON.stringify({
        quote: {
          id: quote.id,
          quote_number: quote.quote_number,
          status: quote.status,
          subtotal: quote.subtotal,
          tax: quote.tax,
          total: quote.total,
          valid_until: quote.valid_until,
          notes: quote.notes,
          line_items: quote.line_items,
          metadata: quote.metadata,
          sent_at: quote.sent_at,
          viewed_at: quote.viewed_at,
          created_at: quote.created_at,
        },
        company: company || {},
        lead: lead || {},
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── POST: Accept or Decline ───────────────────────────────────────
    if (req.method === "POST") {
      const { token, action } = await req.json();

      if (!token || !action) {
        return new Response(JSON.stringify({ error: "token and action required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!["accept", "decline"].includes(action)) {
        return new Response(JSON.stringify({ error: "action must be 'accept' or 'decline'" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: quote, error: fetchErr } = await db
        .from("quotes")
        .select("id, status, company_id, quote_number, lead_id, valid_until")
        .eq("quote_token", token)
        .single();

      if (fetchErr || !quote) {
        return new Response(JSON.stringify({ error: "Quote not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Don't allow action on already accepted/declined quotes
      if (quote.status === "accepted" || quote.status === "declined") {
        return new Response(JSON.stringify({ error: `Quote already ${quote.status}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reject actions on expired quotes
      if (quote.valid_until && new Date(quote.valid_until) < new Date()) {
        return new Response(JSON.stringify({ error: "This quote has expired and can no longer be actioned" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const update: { status: string; accepted_at?: string } = {
        status: action === "accept" ? "accepted" : "declined",
      };
      if (action === "accept") {
        update.accepted_at = new Date().toISOString();
      }

      const { error: updateErr } = await db
        .from("quotes")
        .update(update)
        .eq("id", quote.id);

      if (updateErr) {
        console.error("quote-public update error:", updateErr.message);
        return new Response(JSON.stringify({ error: "Failed to process action. Please try again." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log activity
      await db.from("activity_log").insert({
        company_id: quote.company_id,
        action: action === "accept" ? "quote.accepted" : "quote.declined",
        entity_type: "quote",
        entity_id: quote.id,
        details: {
          quote_number: quote.quote_number,
          action_via: "public_link",
        },
      });

      // If accepted, try to advance the lead to closed_won
      if (action === "accept" && quote.lead_id) {
        await db
          .from("leads")
          .update({ pipeline_stage: "closed_won" })
          .eq("id", quote.lead_id);
        fireWebhooks(db, quote.company_id, "quote.accepted", { quote_id: quote.id, quote_number: quote.quote_number, lead_id: quote.lead_id });
      }

      // If declined, advance to closed_lost
      if (action === "decline" && quote.lead_id) {
        await db
          .from("leads")
          .update({ pipeline_stage: "closed_lost" })
          .eq("id", quote.lead_id);
        fireWebhooks(db, quote.company_id, "quote.declined", { quote_id: quote.id, quote_number: quote.quote_number, lead_id: quote.lead_id });
      }

      return new Response(JSON.stringify({ success: true, status: update.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error("quote-public error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
