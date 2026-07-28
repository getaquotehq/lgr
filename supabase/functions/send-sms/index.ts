// =============================================================================
// Lead Gen Rentals - Manual SMS Send
// =============================================================================
// Allows company users to manually send an SMS to a lead from the dashboard.
// Messages are sent via Twilio and stored in the conversation history.
// Marked as human-sent (is_ai_generated=false) to distinguish from AI replies.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Verify the caller's JWT by passing the bearer token to auth.getUser().
 * If the token is invalid or expired the caller must refresh it and retry.
 */
async function getCallerUser(
  authHeader: string,
  userClient: ReturnType<typeof createClient>,
) {
  const token = (authHeader || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (user) return user;
    if (error) console.warn("auth.getUser() failed:", error.message);
  } catch (e) {
    console.warn("auth.getUser() threw:", (e as Error).message);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth header" }, 401);

    // Authenticated client (for RLS)
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service-role client (for key resolution + writes)
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify user via proper JWT validation
    const user = await getCallerUser(authHeader, userClient);
    if (!user) return json({ error: "Not authenticated" }, 401);

    // Get user's company
    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();

    if (!profile) return json({ error: "No profile found" }, 403);
    const companyId = profile.company_id;

    // Parse request
    const { conversation_id, lead_id, body } = await req.json();
    if (!body?.trim()) return json({ error: "Message body is required" }, 400);
    if (!conversation_id && !lead_id) {
      return json({ error: "conversation_id or lead_id is required" }, 400);
    }

    // Get the lead + their phone number
    let leadId = lead_id;
    let conversationId = conversation_id;

    if (conversationId && !leadId) {
      const { data: conv } = await db
        .from("conversations")
        .select("lead_id")
        .eq("id", conversationId)
        .eq("company_id", companyId)
        .single();
      if (!conv) return json({ error: "Conversation not found" }, 404);
      leadId = conv.lead_id;
    }

    const { data: lead } = await db
      .from("leads")
      .select("id, phone, first_name, last_name, company, sms_opted_out")
      .eq("id", leadId)
      .eq("company_id", companyId)
      .single();

    if (!lead?.phone) return json({ error: "Lead has no phone number" }, 400);

    // Never message a lead who has opted out (replied STOP) - legal requirement.
    if (lead.sms_opted_out) {
      return json({ error: "This lead has opted out of SMS (replied STOP). Message not sent.", opted_out: true }, 409);
    }

    // Normalise to E.164 so Twilio accepts all AU formats:
    //   0412345678  →  +61412345678
    //   61412345678 →  +61412345678
    //   +61412345678 → +61412345678 (unchanged)
    const toE164AU = (phone: string): string => {
      const cleaned = phone.replace(/[\s\-().]/g, "");
      if (cleaned.startsWith("+")) return cleaned;
      if (cleaned.startsWith("61")) return "+" + cleaned;
      if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
      return "+" + cleaned;
    };

    // Get SMS config for the company (need the Twilio number to send from)
    const { data: smsConfig } = await db
      .from("sms_agent_config")
      .select("id, twilio_number")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!smsConfig?.twilio_number) {
      return json({ error: "No Twilio number configured" }, 400);
    }

    // Resolve Twilio keys from edge-function secrets
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!twilioSid || !twilioAuth) {
      return json({ error: "Twilio credentials not configured" }, 500);
    }

    // Check SMS credits
    const { data: creditOk } = await db.rpc("deduct_sms_credit", {
      p_company_id: companyId,
    });
    if (!creditOk) return json({ error: "No SMS credits remaining" }, 402);

    // Send via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: toE164AU(lead.phone),
        From: smsConfig.twilio_number,
        Body: body.trim(),
      }).toString(),
    });

    if (!twilioRes.ok) {
      const errBody = await twilioRes.text();
      console.error("Twilio error:", errBody);

      // Refund the deducted credit since the send failed
      await db.rpc("refund_sms_credit", { p_company_id: companyId }).catch(
        (e: unknown) => console.warn("Failed to refund SMS credit:", (e as Error).message)
      );

      // Parse Twilio error for actionable details
      let detail = "Failed to send SMS.";
      try {
        const twilioErr = JSON.parse(errBody);
        if (twilioErr.message) {
          detail = `Twilio error ${twilioErr.code || twilioRes.status}: ${twilioErr.message}`;
        }
      } catch {
        // Twilio returned non-JSON; include HTTP status
        detail = `Failed to send SMS (Twilio responded with status ${twilioRes.status}).`;
      }
      return json({ error: detail }, 500);
    }

    // Get or create conversation
    if (!conversationId) {
      const { data: existing } = await db
        .from("conversations")
        .select("id")
        .eq("company_id", companyId)
        .eq("lead_id", leadId)
        .eq("channel", "sms")
        .eq("is_open", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        conversationId = existing.id;
      } else {
        const { data: newConv } = await db
          .from("conversations")
          .insert({
            company_id: companyId,
            lead_id: leadId,
            channel: "sms",
            is_open: true,
            sms_config_id: smsConfig.id,
          })
          .select("id")
          .single();
        conversationId = newConv?.id;
      }
    }

    if (!conversationId) return json({ error: "Failed to create conversation" }, 500);

    // Store the message
    const { data: message, error: msgErr } = await db
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        direction: "outbound",
        body: body.trim(),
        channel: "sms",
        is_ai_generated: false,
        agent_type: "human",
        metadata: { sent_by: user.id, manual: true },
      })
      .select()
      .single();

    if (msgErr) return json({ error: "Failed to store message" }, 500);

    // Update conversation last message
    await db
      .from("conversations")
      .update({
        last_message: body.trim(),
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // Log activity
    await db.from("activity_log").insert({
      company_id: companyId,
      user_id: user.id,
      action: "sms.manual_send",
      entity_type: "lead",
      entity_id: leadId,
      details: { conversation_id: conversationId },
    });


    return json({ success: true, message, conversation_id: conversationId });
  } catch (err) {
    console.error("Send SMS error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// True only for the one company tied to a profiles.is_admin=true user (the
// agency/super-admin tenant). Every other company is a no-op.
async function companyIsSuperAdmin(
  db: ReturnType<typeof createClient>,
  companyId: string,
): Promise<boolean> {
  try {
    const { data } = await db
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
