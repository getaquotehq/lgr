// =============================================================================
// LeadGenRentalsHQ - Send Review Request (Scheduled)
// =============================================================================
// Processes pending review requests that are due for sending.
// Called via cron job (pg_cron or external scheduler) or manually.
// Sends review SMS via Twilio and updates request status.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Auth: only the cron scheduler (service role) may invoke this ─────
    const authHeader = req.headers.get("authorization") || "";
    const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    // Constant-time comparison to prevent timing attacks
    const keyBytes = new TextEncoder().encode(callerToken);
    const expectedBytes = new TextEncoder().encode(serviceKey);
    let isMatch = keyBytes.length === expectedBytes.length && keyBytes.length > 0;
    const len = Math.max(keyBytes.length, expectedBytes.length);
    for (let i = 0; i < len; i++) {
      if ((keyBytes[i] ?? 0) !== (expectedBytes[i] ?? 0)) isMatch = false;
    }
    if (!isMatch) {
      return json({ error: "Unauthorized" }, 401);
    }

    const db = createClient(supabaseUrl, serviceKey);

    // Find all pending review requests that are due
    const now = new Date().toISOString();
    const { data: dueRequests, error: fetchErr } = await db
      .from("review_requests")
      .select(`
        id, company_id, lead_id, message_body,
        leads!inner(phone, first_name, sms_opted_out)
      `)
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .limit(50);

    if (fetchErr) {
      console.error("Failed to fetch due review requests:", fetchErr.message);
      return json({ error: "An internal error occurred. Please try again." }, 500);
    }

    if (!dueRequests?.length) {
      return json({ processed: 0, message: "No review requests due." });
    }

    // ── Idempotency: claim this batch atomically before processing ────────
    // Any concurrent invocation will see these rows as non-pending and skip them.
    const batchIds = dueRequests.map((r) => r.id);
    const { error: claimErr } = await db
      .from("review_requests")
      .update({ status: "processing" })
      .in("id", batchIds)
      .eq("status", "pending"); // guard: only update rows still pending

    if (claimErr) {
      console.error("Failed to claim review request batch:", claimErr.message);
      return json({ error: "An internal error occurred. Please try again." }, 500);
    }

    let sent = 0;
    let failed = 0;

    for (const request of dueRequests) {
      try {
        // Get SMS config for this company
        const { data: smsConfig } = await db
          .from("sms_agent_config")
          .select("review_auto_send, twilio_number, is_active")
          .eq("company_id", request.company_id)
          .eq("is_active", true)
          .maybeSingle();

        // Skip if auto-send is disabled or SMS is not configured
        if (!smsConfig?.review_auto_send || !smsConfig.twilio_number) {
          continue;
        }

        const phone = request.leads?.phone;
        if (!phone) {
          await db.from("review_requests")
            .update({ status: "skipped" })
            .eq("id", request.id);
          continue;
        }

        // Never message a lead who has opted out of SMS (replied STOP).
        if ((request.leads as { sms_opted_out?: boolean })?.sms_opted_out) {
          await db.from("review_requests")
            .update({ status: "skipped" })
            .eq("id", request.id);
          continue;
        }

        // Resolve Twilio credentials from edge-function secrets
        const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
        if (!twilioSid || !twilioAuth) {
          console.warn(`Twilio credentials not configured for company ${request.company_id}`);
          await db.from("review_requests")
            .update({ status: "failed" })
            .eq("id", request.id);
          failed++;
          continue;
        }

        // Check SMS credits
        const { data: creditOk } = await db.rpc("deduct_sms_credit", {
          p_company_id: request.company_id,
        });
        if (!creditOk) {
          console.warn(`No SMS credits for company ${request.company_id}`);
          continue; // Don't fail - try again later when credits replenished
        }

        // Send via Twilio
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const twilioRes = await fetch(twilioUrl, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: phone,
            From: smsConfig.twilio_number,
            Body: (request.message_body || "").trim(),
          }).toString(),
        });

        if (!twilioRes.ok) {
          const errBody = await twilioRes.text();
          console.error(`Twilio error for request ${request.id}:`, errBody);

          // Refund SMS credit
          await db.rpc("refund_sms_credit", { p_company_id: request.company_id })
            .catch((e: unknown) => console.warn("Refund error:", e instanceof Error ? e.message : String(e)));

          await db.from("review_requests")
            .update({ status: "failed" })
            .eq("id", request.id);
          failed++;
          continue;
        }

        // Mark as sent
        await db.from("review_requests")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", request.id);

        // Store message in conversation history
        const { data: conv } = await db
          .from("conversations")
          .select("id")
          .eq("lead_id", request.lead_id)
          .eq("company_id", request.company_id)
          .maybeSingle();

        if (conv) {
          await db.from("messages").insert({
            conversation_id: conv.id,
            direction: "outbound",
            body: request.message_body,
            is_ai_generated: false,
            agent_type: null,
          });
        }

        sent++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing review request ${request.id}:`, errMsg);
        await db.from("review_requests")
          .update({ status: "failed" })
          .eq("id", request.id);
        failed++;
      }
    }

    return json({ processed: dueRequests.length, sent, failed });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("send-review-request error:", errMsg);
    return json({ error: "Internal server error" }, 500);
  }
});
