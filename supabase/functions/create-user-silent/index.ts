import { createClient } from "npm:@supabase/supabase-js@2";

// ── Account-setup email ───────────────────────────────────────────────────────
// The account is created WITHOUT a password. The user clicks the setup link
// (a Supabase recovery link) which lands them on the dashboard, fires the
// PASSWORD_RECOVERY event, and shows the "choose a password" modal.
async function sendSetupEmail(
  resendApiKey: string,
  email: string,
  name: string,
  setupLink: string | null,
): Promise<void> {
  const ctaSection = setupLink
    ? `<a href="${setupLink}"
         style="display:inline-block;background:#F59E0B;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
         Set your password &rarr;
       </a>
       <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
         This link expires in 1 hour. If it expires, ask your admin to resend it, or use “Forgot password” on the login page.
       </p>`
    : `<p style="margin:0;font-size:14px;color:#374151">
         To finish setting up, go to
         <a href="https://leadgenrentals.com.au/dashboard" style="color:#F59E0B">leadgenrentals.com.au/dashboard</a>
         and use “Forgot password” to choose your password.
       </p>`;

  const ctaText = setupLink
    ? `Set your password (expires in 1 hour): ${setupLink}\n\nIf it expires, use "Forgot password" at https://leadgenrentals.com.au/dashboard`
    : `To finish setting up, go to https://leadgenrentals.com.au/dashboard and use "Forgot password" to choose your password.`;

  const html = `
<html><body style="margin:0;padding:0;background:#f3f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
<tr><td style="background:#F59E0B;padding:24px 32px">
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">Lead Gen Rentals</h1>
</td></tr>
<tr><td style="padding:32px">
  <h2 style="margin:0 0 16px;font-size:18px;color:#111827">Welcome - let's set up your account</h2>
  <p style="margin:0 0 16px;font-size:14px;color:#374151">Hi ${name},</p>
  <p style="margin:0 0 24px;font-size:14px;color:#374151">
    An account has been created for you on Lead Gen Rentals. Click the button below to choose your password and log in.
  </p>
  <table cellpadding="0" cellspacing="0" style="background:#f8f9fb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;width:100%">
    <tr><td style="font-size:13px;color:#6b7280;padding-bottom:6px">Your login email</td></tr>
    <tr><td style="font-size:15px;color:#111827;font-weight:600">${email}</td></tr>
  </table>
  ${ctaSection}
</td></tr>
<tr><td style="padding:16px 32px;background:#f8f9fb;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
    Lead Gen Rentals &mdash; All rights reserved.
  </p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  const fromAddress =
    Deno.env.get("RESEND_FROM_EMAIL") ||
    "Lead Gen Rentals <noreply@leadgenrentals.com.au>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [email],
      subject: "Set up your Lead Gen Rentals account",
      html,
      text: `Hi ${name},\n\nAn account has been created for you on Lead Gen Rentals.\n\nYour login email: ${email}\n\n${ctaText}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend API returned HTTP ${res.status}: ${body}`);
  }
}

// ── CORS headers ──────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Verify caller JWT and resolve their auth.users record ─────────────────────
async function resolveCallerUser(
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

// ── Build SMS agent system prompt and welcome message ─────────────────────────
function buildSmsPrompts(
  company: string,
  niche: string,
): { system_prompt: string; welcome_message: string } {
  const system_prompt =
    `Use natural Australian English, not American English.

Never quote specific prices or guarantees - always defer to the team. For financing specifics, defer to the team.

If someone says not interested, acknowledge it politely and close the conversation.

Escalate to a human immediately if: the lead mentions a complaint, asks about an existing job, mentions anything legal or billing related, or asks for the owner or manager. Do not attempt to handle these yourself.`;

  const welcome_message =
    `Hi, thanks for reaching out to ${company}. We just wanted to confirm you're looking for a ${niche} quote - is that correct?`;

  return { system_prompt, welcome_message };
}

// ── Provision sms_agent_config with prompts and optional Twilio number ────────
// Always called after account creation. Sets system_prompt, welcome_message,
// and twilio_number on the existing config row (created by trigger) without
// overwriting fields that are already customised.
async function provisionSmsAgentConfig(
  adminClient: ReturnType<typeof createClient>,
  companyId: string,
  companyName: string | null,
  niche: string | null,
  twilioPhone: string | null,
): Promise<void> {
  try {
    const { data: cfg, error: cfgErr } = await adminClient
      .from("sms_agent_config")
      .select("id, system_prompt, welcome_message, twilio_number")
      .eq("company_id", companyId)
      .maybeSingle();
    if (cfgErr) {
      console.warn("provisionSmsAgentConfig lookup failed:", cfgErr.message);
      return;
    }

    const patch: Record<string, unknown> = {};
    if (companyName && niche) {
      const { system_prompt, welcome_message } = buildSmsPrompts(companyName, niche);
      patch.system_prompt = system_prompt;
      patch.welcome_message = welcome_message;
    }
    if (twilioPhone && !cfg?.twilio_number) {
      patch.twilio_number = twilioPhone;
    }
    if (!Object.keys(patch).length) return;

    if (cfg) {
      const { error: upErr } = await adminClient
        .from("sms_agent_config")
        .update(patch)
        .eq("id", cfg.id);
      if (upErr) console.warn("provisionSmsAgentConfig update failed:", upErr.message);
    } else {
      const { error: insErr } = await adminClient
        .from("sms_agent_config")
        .insert({
          company_id: companyId,
          name: "Default SMS Agent",
          auto_reply: false,
          is_active: false,
          lead_scoring_enabled: false,
          ...patch,
        });
      if (insErr) console.warn("provisionSmsAgentConfig insert failed:", insErr.message);
    }
  } catch (e) {
    console.warn("provisionSmsAgentConfig threw:", (e as Error).message);
  }
}

Deno.serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── Auth header required ──────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // ── Build two Supabase clients ────────────────────────────────────────────
    // userClient: runs as the calling user - used only for JWT validation.
    // adminClient: uses the service role key - NEVER returned to the client.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // ── Verify caller JWT ─────────────────────────────────────────────────────
    const caller = await resolveCallerUser(authHeader, userClient);
    if (!caller) {
      return json({ error: "Not authenticated" }, 401);
    }

    // ── Check is_admin flag ───────────────────────────────────────────────────
    // Queried via adminClient to bypass RLS and prevent privilege escalation.
    const { data: callerProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileError) {
      console.error("Profile lookup error:", profileError.message);
      return json({ error: "Internal error checking admin status" }, 500);
    }

    if (!callerProfile?.is_admin) {
      return json({ error: "Forbidden: admin access required" }, 403);
    }

    // ── Parse and validate body ───────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as {
      email?: unknown;
      name?: unknown;
      company_name?: unknown;
      company_phone?: unknown;
      company_email?: unknown;
      plan?: unknown;
      website_url?: unknown;
      service_area?: unknown;
      niche?: unknown;
      user_phone?: unknown;
      role?: unknown;
      twilio_number_id?: unknown;
      twilio_phone_number?: unknown;
    };

    const {
      email, name,
      company_name, company_phone, company_email,
      plan, website_url, service_area, niche, user_phone, role,
      twilio_number_id, twilio_phone_number,
    } = body;

    if (!email || typeof email !== "string") {
      return json({ error: "email is required" }, 400);
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return json({ error: "name is required" }, 400);
    }
    if (name.trim().length > 120) {
      return json({ error: "name must be 120 characters or fewer" }, 400);
    }
    // No password is set here: the account is created passwordless and the user
    // chooses their own password via the setup (recovery) link emailed below.

    const sanitizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
      return json({ error: "Invalid email address" }, 400);
    }

    // ── Create the user WITHOUT a password ────────────────────────────────────
    // email_confirm: true marks the address as verified immediately. The user
    // sets their own password via the recovery link emailed at the end.
    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email: sanitizedEmail,
        email_confirm: true,
        user_metadata: { full_name: name.trim() },
      });

    if (createError || !newUser?.user) {
      console.error("createUser error:", createError?.message);
      return json(
        { error: createError?.message || "Failed to create user" },
        500,
      );
    }

    // ── Update company and profile with additional details ────────────────────
    // handle_new_user() trigger runs synchronously with the INSERT so the profile
    // and company rows exist immediately. Poll briefly for replication safety.
    const newUserId = newUser.user.id;
    let companyId: string | null = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 200));
      const { data: profileRow } = await adminClient
        .from("profiles")
        .select("company_id")
        .eq("id", newUserId)
        .maybeSingle();
      if (profileRow?.company_id) {
        companyId = profileRow.company_id;
        break;
      }
    }


    if (companyId) {
      const effectiveCompanyName = (typeof company_name === "string" && company_name.trim())
        ? company_name.trim().slice(0, 200)
        : null;
      const effectiveNiche = (typeof niche === "string" && niche.trim())
        ? niche.trim().slice(0, 200)
        : null;

      const companyPatch: Record<string, unknown> = {};
      if (effectiveCompanyName) companyPatch.name = effectiveCompanyName;
      if (typeof company_phone === "string" && company_phone.trim()) {
        companyPatch.phone = company_phone.trim();
      }
      if (typeof company_email === "string" && company_email.trim()) {
        const ce = company_email.trim().toLowerCase();
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ce)) companyPatch.email = ce;
      }
      // "ppl" is the stored plan key for an asset-rental client.
      if (plan === "managed" || plan === "ppl") {
        companyPatch.plan = plan as string;
      }
      if (typeof website_url === "string" && website_url.trim()) {
        companyPatch.website_url = website_url.trim();
      }
      if (typeof service_area === "string" && service_area.trim()) {
        companyPatch.service_area = service_area.trim();
      }
      if (effectiveNiche) companyPatch.niche = effectiveNiche;
      if (Object.keys(companyPatch).length) {
        const { error: compErr } = await adminClient
          .from("companies")
          .update(companyPatch)
          .eq("id", companyId);
        if (compErr) console.warn("Company patch failed (non-fatal):", compErr.message);
      }


      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let assignedTwilioPhone: string | null = null;
      if (typeof twilio_number_id === "string" && UUID_RE.test(twilio_number_id)) {
        const { data: tnRow, error: tnErr } = await adminClient
          .from("twilio_numbers")
          .update({ company_id: companyId })
          .eq("id", twilio_number_id)
          .select("phone_number")
          .maybeSingle();
        if (tnErr) console.warn("Twilio assignment failed (non-fatal):", tnErr.message);
        else assignedTwilioPhone = (tnRow?.phone_number as string) || null;
      } else if (
        typeof twilio_phone_number === "string" && twilio_phone_number.trim()
      ) {
        // Manual entry: assign the existing pool number if it matches, else
        // create a new twilio_numbers row owned by the new company.
        const phone = twilio_phone_number.trim().slice(0, 32);
        const { data: existingNums } = await adminClient
          .from("twilio_numbers")
          .select("id")
          .eq("phone_number", phone)
          .limit(1);
        if (existingNums && existingNums.length) {
          const { error: tnErr } = await adminClient
            .from("twilio_numbers")
            .update({ company_id: companyId })
            .eq("id", existingNums[0].id);
          if (tnErr) console.warn("Twilio assignment failed (non-fatal):", tnErr.message);
          else assignedTwilioPhone = phone;
        } else {
          const { error: tnErr } = await adminClient
            .from("twilio_numbers")
            .insert({ phone_number: phone, company_id: companyId });
          if (tnErr) console.warn("Twilio insert failed (non-fatal):", tnErr.message);
          else assignedTwilioPhone = phone;
        }
      }

      // Bake system_prompt and welcome_message into the SMS agent config, and
      // wire any assigned Twilio number so the account is send-ready without
      // a second manual step.
      await provisionSmsAgentConfig(
        adminClient,
        companyId,
        effectiveCompanyName,
        effectiveNiche,
        assignedTwilioPhone,
      );
    }

    const profilePatch: Record<string, unknown> = {};
    if (typeof user_phone === "string" && user_phone.trim()) {
      profilePatch.phone = user_phone.trim();
    }
    if (role === "owner" || role === "admin" || role === "member") {
      profilePatch.role = role as string;
    }
    if (Object.keys(profilePatch).length) {
      const { error: profErr } = await adminClient
        .from("profiles")
        .update(profilePatch)
        .eq("id", newUserId);
      if (profErr) console.warn("Profile patch failed (non-fatal):", profErr.message);
    }

    // ── Generate a one-time setup (recovery) link for the new user ────────────
    // Lands on index.html, which fires PASSWORD_RECOVERY and shows the
    // "choose a password" modal. Single-use; expires automatically (default 1h).
    let setupLink: string | null = null;
    try {
      const { data: linkData, error: linkErr } =
        await adminClient.auth.admin.generateLink({
          type: "recovery",
          email: sanitizedEmail,
          options: { redirectTo: `${Deno.env.get("SITE_URL") ?? "https://leadgenrentals.com.au/dashboard"}/index.html` },
        });
      if (!linkErr && linkData?.properties?.action_link) {
        setupLink = linkData.properties.action_link;
      } else if (linkErr) {
        console.warn("Setup link generation failed (non-fatal):", linkErr.message);
      }
    } catch (e) {
      console.warn("Setup link generation threw (non-fatal):", (e as Error).message);
    }

    // ── Send the account-setup email ──────────────────────────────────────────
    // Awaited so the promise completes before the handler returns - Deno's
    // serverless runtime does not guarantee background tasks finish after the
    // response is sent. Email failure is non-fatal: the account is still created.
    let emailSent = false;
    let emailError: string | null = null;
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
      await sendSetupEmail(
        resendApiKey,
        sanitizedEmail,
        name.trim(),
        setupLink,
      );
      emailSent = true;
    } catch (e) {
      emailError = (e as Error).message ?? String(e);
      console.warn("Welcome email failed (non-fatal):", emailError);
    }

    const responsePayload: Record<string, unknown> = {
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
      },
      email_sent: emailSent,
      email_error: emailError,
    };
    if (wantsPplOrder) {
    }
    return json(responsePayload);
  } catch (err) {
    console.error("create-user-silent unhandled error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
