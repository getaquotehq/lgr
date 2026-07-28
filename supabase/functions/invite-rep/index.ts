import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Inline email template (avoids local-file import that breaks deployment) ──
const _BRAND_COLOR = "#F59E0B";
const _BRAND_NAME = "Lead Gen Rentals";
function _baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
<tr><td style="background:${_BRAND_COLOR};padding:24px 32px">
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">${_BRAND_NAME}</h1>
</td></tr>
<tr><td style="padding:32px">
  ${content}
</td></tr>
<tr><td style="padding:16px 32px;background:#f8f9fb;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
    &copy; ${new Date().getFullYear()} ${_BRAND_NAME}. All rights reserved.
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
function _buttonHtml(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td>
<a href="${url}" style="display:inline-block;padding:12px 28px;background:${_BRAND_COLOR};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">${text}</a>
</td></tr></table>`;
}
function inviteRepEmail(repName: string, companyName: string, inviteLink: string): { subject: string; html: string } {
  return {
    subject: `You've been invited to join ${companyName} on Lead Gen Rentals`,
    html: _baseLayout(`
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827">You're Invited!</h2>
      <p style="margin:0 0 8px;font-size:14px;color:#374151">Hi ${repName},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151">You've been invited to join <strong>${companyName}</strong> on ${_BRAND_NAME}. Click the button below to set up your account and get started.</p>
      ${_buttonHtml("Accept Invitation", inviteLink)}
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280">If you didn't expect this invitation, you can safely ignore this email.</p>
    `),
  };
}

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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Client authenticated as the inviting user
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Admin client for creating users
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get the inviting user via proper JWT validation
    const inviter = await getCallerUser(authHeader, userClient);

    if (!inviter) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get inviter's profile to check role and company
    const { data: profile } = await adminClient
      .from("profiles")
      .select("company_id, role")
      .eq("id", inviter.id)
      .single();

    if (!profile || !["owner", "admin"].includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Only owners and admins can invite reps" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check current rep count
    const { count } = await adminClient
      .from("sales_reps")
      .select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id);

    if ((count ?? 0) >= 10) {
      return new Response(
        JSON.stringify({ error: "Maximum of 10 sales reps reached" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { email, name, phone, visibility } = await req.json();

    if (!email || !name) {
      return new Response(
        JSON.stringify({ error: "Email and name are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create-or-find the invited user.
    // Try to create first; if the user already exists Supabase returns an
    // error containing "already been registered" - we then fall back to a
    // targeted listUsers lookup.
    let newUserId: string;
    let isNewUser = false;

    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        user_metadata: {
          full_name: name,
          company_id: profile.company_id,
          user_type: "external",
        },
        email_confirm: true, // Pre-confirm so signInWithPassword never triggers Supabase's internal email rate limit
      });

    if (newUser?.user) {
      // Brand-new user
      newUserId = newUser.user.id;
      isNewUser = true;
    } else if (
      createError &&
      /already|exists|duplicate|unique/i.test(createError.message || "")
    ) {
      // User already exists - look them up by paginating through auth users.
      // The Supabase JS admin API does not support server-side email filtering,
      // so we page through 1000 at a time and stop as soon as we find a match.
      let found: { id: string; email?: string } | undefined;
      let page = 1;
      while (!found) {
        const { data: pageData } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (!pageData?.users?.length) break;
        found = pageData.users.find((u: { id: string; email?: string }) => u.email === email);
        if (pageData.users.length < 1000) break; // last page
        page++;
      }
      if (!found) {
        return new Response(
          JSON.stringify({ error: "User appears to exist but could not be found" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      newUserId = found.id;

      // Ensure they have a profile for this company
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", found.id)
        .maybeSingle();

      if (!existingProfile) {
        await adminClient.from("profiles").insert({
          id: found.id,
          company_id: profile.company_id,
          user_type: "external",
          full_name: name,
          role: "member",
          phone,
        });
      }
    } else {
      return new Response(
        JSON.stringify({ error: createError?.message || "Failed to create user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate an invite link to send via Resend.
    // For NEW users use type "invite"; for EXISTING users use "magiclink".
    // Falls back to "recovery" if the primary type fails.
    let emailSent = false;
    let emailError: string | null = null;
    let actionLink: string | null = null;

    const siteUrl = Deno.env.get("SITE_URL") ?? "http://localhost:3000";
    const linkType = isNewUser ? "invite" : "magiclink";

    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: linkType,
        email,
        options: {
          redirectTo: `${siteUrl}/`,
        },
      });

    if (linkData?.properties?.action_link) {
      actionLink = linkData.properties.action_link;
    } else {
      console.warn(`generateLink(${linkType}) failed:`, linkError?.message || "no action_link");
      // Fallback: try "recovery" type - works for both confirmed & unconfirmed
      const { data: fallbackData, error: fallbackError } =
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email,
          options: {
            redirectTo: `${siteUrl}/`,
          },
        });
      if (fallbackData?.properties?.action_link) {
        actionLink = fallbackData.properties.action_link;
      } else {
        console.error("Recovery link fallback also failed:", fallbackError?.message || "no action_link");
        emailError = "Failed to generate invitation link";
      }
    }

    // Send branded invite email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY is not configured - invite email will not be sent");
      emailError = emailError || "Unable to send invitation email - please contact support";
    } else if (!actionLink) {
      console.error("No invite link available - Resend API will not be called");
      emailError = emailError || "Failed to generate invitation link";
    } else {
      try {
        // Look up company name for the email
        const { data: company } = await adminClient
          .from("companies")
          .select("name")
          .eq("id", profile.company_id)
          .single();

        const emailContent = inviteRepEmail(
          name,
          company?.name || "a team",
          actionLink,
        );

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM_EMAIL") || "Lead Gen Rentals <noreply@leadgenrentals.com.au>",
            to: [email],
            subject: emailContent.subject,
            html: emailContent.html,
          }),
        });

        if (resendRes.ok) {
          emailSent = true;
        } else {
          const errData = await resendRes.text();
          console.error("Resend API error:", resendRes.status, errData);
          emailError = "Email service failed to deliver the invitation";
        }
      } catch (emailErr) {
        console.error("Resend invite email error:", emailErr);
        emailError = "Email service encountered an error";
      }
    }

    // Create or update the sales rep record (upsert avoids duplicate-key
    // errors when re-inviting an existing team member to the same company).
    const defaultVisibility = "assigned_only";
    const ALLOWED_VISIBILITY = ["assigned_only", "team_only", "all"];
    const safeVis = (v: unknown) =>
      typeof v === "string" && ALLOWED_VISIBILITY.includes(v) ? v : defaultVisibility;
    const { data: rep, error: repError } = await adminClient
      .from("sales_reps")
      .upsert(
        {
          company_id: profile.company_id,
          user_id: newUserId,
          name,
          email,
          phone: phone || null,
          is_active: true,
          leads_visibility: safeVis(visibility?.leads),
          quotes_visibility: safeVis(visibility?.quotes),
          appointments_visibility: safeVis(visibility?.appointments),
          sales_visibility: safeVis(visibility?.sales),
          conversations_visibility: safeVis(visibility?.conversations),
          // Default permissions for new members (false = read-only)
          can_edit_leads: false,
          can_edit_quotes: false,
          can_edit_appointments: false,
          can_manage_pipeline: false,
          can_send_sms: false,
          can_initiate_calls: false,
        },
        { onConflict: "company_id, user_id" }
      )
      .select()
      .single();

    if (repError) {
      return new Response(JSON.stringify({ error: repError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Track invite in sales_rep_invites table for dashboard visibility.
    // Use upsert-like logic: revoke any existing pending invite for this
    // email+company then insert a fresh one, so re-invites don't create
    // duplicate rows.
    const { error: revokeErr } = await adminClient
      .from("sales_rep_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("company_id", profile.company_id)
      .eq("email", email)
      .eq("status", "pending");
    if (revokeErr) console.error("Failed to revoke old pending invites:", revokeErr);

    await adminClient.from("sales_rep_invites").insert({
      company_id: profile.company_id,
      email,
      full_name: name,
      phone: phone || null,
      status: "pending",
    });

    return new Response(
      JSON.stringify({
        message: emailSent
          ? `Invite sent to ${email}`
          : `User added but invitation email could not be sent`,
        email_sent: emailSent,
        email_error: emailError,
        rep,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("invite-rep error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
