// =============================================================================
// LeadGenRentalsHQ - Resend Email Sender
// =============================================================================
// Centralised email sending via Resend (https://resend.com).
// Called internally by other edge functions (twilio-inbound-sms, quote-draft,
// invite-rep). Callers must authenticate with the SUPABASE_SERVICE_ROLE_KEY
// as a Bearer token.
//
// Environment variable: RESEND_API_KEY (set in Supabase Edge Function secrets)
//
// Payload:
// {
//   to:       string | string[],   - recipient email(s)
//   subject:  string,              - email subject
//   html:     string,              - email body (HTML)
//   text?:    string,              - plain-text fallback (optional)
//   reply_to?: string,             - reply-to address (optional)
// }
// =============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_FROM =
  Deno.env.get("RESEND_FROM_EMAIL") ||
  "Lead Gen Rentals <noreply@leadgenrentals.com.au>";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth: only internal callers (service role) may use this function ──
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("authorization") || "";
    const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    // Constant-time comparison to prevent timing attacks
    const keyBytes = new TextEncoder().encode(callerToken);
    const expectedBytes = new TextEncoder().encode(serviceRoleKey ?? "");
    let isMatch = keyBytes.length === expectedBytes.length && keyBytes.length > 0 && !!serviceRoleKey;
    const len = Math.max(keyBytes.length, expectedBytes.length);
    for (let i = 0; i < len; i++) {
      if ((keyBytes[i] ?? 0) !== (expectedBytes[i] ?? 0)) isMatch = false;
    }
    if (!isMatch) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { to, subject, html, text, reply_to } = body;

    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "to, subject, and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Send email via Resend API - sender is always the platform default
    const resendPayload: Record<string, unknown> = {
      from: DEFAULT_FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };

    if (text) resendPayload.text = text;
    if (reply_to) resendPayload.reply_to = reply_to;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API error:", resendData);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("resend-email error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
