// =============================================================================
// LeadGenRentalsHQ - Send Password Reset via Resend
// =============================================================================
// Same pattern as invite-rep:
//   1. admin.generateLink({ type: "recovery", redirectTo: dashboard.html })
//      → returns action_link (Supabase handles the token exchange server-side)
//   2. Send action_link in a branded email via Resend
//   3. User clicks → Supabase redirects to dashboard.html → onAuthStateChange
//      fires PASSWORD_RECOVERY → reset modal shown
//
// Payload: { email: string }
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BRAND_COLOR = "#1f6fff";
const BRAND_NAME = "LeadGenRentalsHQ";

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
<tr><td style="background:${BRAND_COLOR};padding:24px 32px">
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">${BRAND_NAME}</h1>
</td></tr>
<tr><td style="padding:32px">
  ${content}
</td></tr>
<tr><td style="padding:16px 32px;background:#f8f9fb;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
    &copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function buttonHtml(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td>
<a href="${url}" style="display:inline-block;padding:12px 28px;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">${text}</a>
</td></tr></table>`;
}

function passwordResetEmail(resetLink: string): { subject: string; html: string } {
  return {
    subject: "Reset your LeadGenRentalsHQ password",
    html: baseLayout(`
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827">Password Reset</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#374151">We received a request to reset your password. Click the button below to choose a new password.</p>
      ${buttonHtml("Reset Password", resetLink)}
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    `),
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "Email service is not configured. Please contact support." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const siteUrl = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Generate recovery link - same approach as invite-rep.
    // action_link is a full Supabase URL that redirects to SITE_URL/dashboard.html
    // after verifying the token server-side, firing PASSWORD_RECOVERY in onAuthStateChange.
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: `${siteUrl}/dashboard.html`,
        },
      });

    if (!linkData?.properties?.action_link) {
      // User doesn't exist or other error - return 200 to prevent email enumeration
      console.log("send-password-rest: generateLink failed:", linkError?.message ?? "no action_link");
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const actionLink = linkData.properties.action_link;
    console.log("send-password-rest: generated recovery link for", email);

    const emailContent = passwordResetEmail(actionLink);
    const from = Deno.env.get("RESEND_FROM_EMAIL") ?? "LeadGenRentalsHQ <noreply@leadgenrentals.com.au/dashboard>";

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error(`Resend error (${resendRes.status}):`, errText);
      return new Response(
        JSON.stringify({ error: "Unable to send reset email. Please try again." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendData = await resendRes.json();
    console.log("send-password-rest: email sent, id:", resendData?.id);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-password-rest error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
