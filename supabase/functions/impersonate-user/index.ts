import { createClient } from "npm:@supabase/supabase-js@2";

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

// ── Keep sms_agent_config.twilio_number in step with twilio_numbers ──────────
// Fills the company's agent config with the assigned number, but never
// overwrites a number that is already configured.
async function syncAgentTwilioNumber(
  adminClient: ReturnType<typeof createClient>,
  companyId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const { data: cfg, error: cfgErr } = await adminClient
      .from("sms_agent_config")
      .select("id, twilio_number")
      .eq("company_id", companyId)
      .maybeSingle();
    if (cfgErr) {
      console.warn("syncAgentTwilioNumber lookup failed:", cfgErr.message);
      return;
    }
    if (cfg) {
      if (!cfg.twilio_number) {
        const { error: upErr } = await adminClient
          .from("sms_agent_config")
          .update({ twilio_number: phoneNumber })
          .eq("id", cfg.id);
        if (upErr) console.warn("syncAgentTwilioNumber update failed:", upErr.message);
      }
    } else {
      // Mirror provision_sms_for_company() defaults: inactive until configured.
      const { error: insErr } = await adminClient
        .from("sms_agent_config")
        .insert({
          company_id: companyId,
          name: "Default SMS Agent",
          auto_reply: false,
          is_active: false,
          lead_scoring_enabled: false,
          twilio_number: phoneNumber,
        });
      if (insErr) console.warn("syncAgentTwilioNumber insert failed:", insErr.message);
    }
  } catch (e) {
    console.warn("syncAgentTwilioNumber threw:", (e as Error).message);
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
    // We query via the adminClient to bypass RLS and avoid any possibility of
    // a user manipulating the result through a crafted JWT or RLS policy.
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

    // ── Route on action ───────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    // ── action: list ──────────────────────────────────────────────────────────
    // Returns a condensed list of all auth users (email + profile metadata).
    // The service role key stays server-side; only safe fields are returned.
    if (action === "list") {
      const users: Array<{
        id: string;
        email: string;
        full_name: string | null;
        company_id: string | null;
        role: string | null;
        is_admin: boolean;
        created_at: string;
        inactive_marked_at: string | null;
        deletion_notice_sent_at: string | null;
      }> = [];

      let page = 1;
      while (true) {
        const { data: pageData, error: listError } =
          await adminClient.auth.admin.listUsers({ page, perPage: 1000 });

        if (listError) {
          console.error("listUsers error:", listError.message);
          return json({ error: "Failed to list users" }, 500);
        }

        if (!pageData?.users?.length) break;

        // Batch-fetch matching profiles for this page of users
        const ids = pageData.users.map((u: { id: string }) => u.id);
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id, full_name, company_id, role, is_admin, inactive_marked_at, deletion_notice_sent_at")
          .in("id", ids);

        const profileMap = Object.fromEntries(
          (profiles || []).map((p: {
            id: string;
            full_name: string | null;
            company_id: string | null;
            role: string | null;
            is_admin: boolean;
            inactive_marked_at: string | null;
            deletion_notice_sent_at: string | null;
          }) => [p.id, p]),
        );

        for (const u of pageData.users) {
          const p = profileMap[u.id] || null;
          users.push({
            id: u.id,
            email: u.email ?? "",
            full_name: p?.full_name ?? null,
            company_id: p?.company_id ?? null,
            role: p?.role ?? null,
            is_admin: p?.is_admin ?? false,
            created_at: u.created_at ?? "",
            inactive_marked_at: p?.inactive_marked_at ?? null,
            deletion_notice_sent_at: p?.deletion_notice_sent_at ?? null,
          });
        }

        if (pageData.users.length < 1000) break;
        page++;
      }

      return json({ users });
    }

    // ── action: login ─────────────────────────────────────────────────────────
    // Generates a magic-link token for the target user, immediately exchanges
    // it for a session server-side via verifyOtp, and returns the session.
    // No email is ever sent to the target user.
    if (action === "login") {
      const { email } = body as { email?: string };
      if (!email || typeof email !== "string") {
        return json({ error: "Missing or invalid email" }, 400);
      }

      // Sanitise email
      const targetEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
        return json({ error: "Invalid email address" }, 400);
      }

      // Step 1: generate a magic-link - does NOT send any email.
      const { data: linkData, error: linkError } =
        await adminClient.auth.admin.generateLink({
          type: "magiclink",
          email: targetEmail,
        });

      if (linkError || !linkData?.properties?.hashed_token) {
        console.error(
          "generateLink error:",
          linkError?.message || "no hashed_token",
        );
        return json({ error: "Failed to generate impersonation token" }, 500);
      }

      const hashedToken = linkData.properties.hashed_token;

      // Step 2: exchange the hashed_token for a live session - still
      // server-side, never leaves this function until it is a session object.
      const { data: otpData, error: otpError } =
        await adminClient.auth.verifyOtp({
          token_hash: hashedToken,
          type: "email",
        });

      if (otpError || !otpData?.session) {
        console.error(
          "verifyOtp error:",
          otpError?.message || "no session returned",
        );
        return json({ error: "Failed to create impersonation session" }, 500);
      }

      // Return only the session - service role key is never included.
      return json({ session: otpData.session });
    }

    // ── action: list_companies ────────────────────────────────────────────────
    // Returns id, name, plan, email for every company, sorted alphabetically.
    if (action === "list_companies") {
      const { data: companies, error: companyErr } = await adminClient
        .from("companies")
        .select("id, name, plan, email")
        .order("name", { ascending: true });

      if (companyErr) {
        console.error("list_companies error:", companyErr.message);
        return json({ error: "Failed to load companies" }, 500);
      }

      return json({ companies: companies || [] });
    }

    // ── action: update_company ────────────────────────────────────────────────
    // Updates plan (and optionally name/email) for a company.
    if (action === "update_company") {
      const { company_id, plan, name, email } = body as {
        company_id?: string;
        plan?: string;
        name?: string;
        email?: string;
      };

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!company_id || !UUID_RE.test(company_id)) {
        return json({ error: "company_id must be a valid UUID" }, 400);
      }
      // "ppl" is the stored plan key for an asset-rental client.
      const VALID_PLANS = ["free", "managed", "ppl", "ppl_managed"];
      if (plan !== undefined && !VALID_PLANS.includes(plan)) {
        return json({ error: "plan must be 'free', 'managed' or 'ppl'" }, 400);
      }

      const update: Record<string, unknown> = {};
      if (plan  !== undefined) update.plan  = plan;
      if (name  !== undefined && name.trim())  update.name  = name.trim();
      if (email !== undefined && email.trim()) update.email = email.trim().toLowerCase();

      if (!Object.keys(update).length) return json({ success: true, company_id });

      const { error: updateErr } = await adminClient
        .from("companies")
        .update(update)
        .eq("id", company_id);

      if (updateErr) {
        console.error("update_company error:", updateErr.message);
        return json({ error: "Failed to update company: " + updateErr.message }, 500);
      }

      return json({ success: true, company_id });
    }

    // ── action: get_user_details ──────────────────────────────────────────────
    // Returns full profile + company + twilio numbers + rentals + sms credits
    // for a single user. Used by the admin Edit User modal.
    if (action === "get_user_details") {
      const { user_id } = body as { user_id?: string };

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!user_id || !UUID_RE.test(user_id)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("id, full_name, company_id, role, phone, is_admin, created_at")
        .eq("id", user_id)
        .maybeSingle();

      const companyId = profile?.company_id;

      let company = null,
        twilioNumbers: unknown[] = [],
        rentals: unknown[] = [],
        smsCredits = null,
        leadCount = 0;

      if (companyId) {
        const [compRes, twilioRes, _unused, smsRes, leadRes] = await Promise.all([
          adminClient
            .from("companies")
            .select("*")
            .eq("id", companyId)
            .maybeSingle(),
          adminClient
            .from("twilio_numbers")
            .select("id, phone_number, friendly_name")
            .eq("company_id", companyId)
            .order("created_at"),
          adminClient
            .from("sms_credits")
            .select("company_id")
            .eq("company_id", companyId)
            .maybeSingle(),
          adminClient
            .from("sms_credits")
            .select("balance, lifetime_used, monthly_free_sms, next_reset_at")
            .eq("company_id", companyId)
            .maybeSingle(),
          adminClient
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId),
        ]);

        company       = compRes.data;
        twilioNumbers = twilioRes.data || [];
        smsCredits    = smsRes.data;
        leadCount     = leadRes.count ?? 0;

        // Rentals hang off installers, not companies, so resolve the installer
        // by business name first. Without this the query returned every active
        // rental in the system for whichever user was opened.
        const companyName = (company as { name?: string } | null)?.name;
        if (companyName) {
          const { data: inst } = await adminClient
            .from("installers")
            .select("id")
            .eq("business_name", companyName)
            .maybeSingle();
          if (inst?.id) {
            const { data: rentalRows } = await adminClient
              .from("rentals")
              .select("id, monthly_price_aud, floor_leads, started_at, ended_at, assets(brand_name, tier, niches(name), regions(name, state))")
              .eq("installer_id", inst.id)
              .is("ended_at", null)
              .order("started_at", { ascending: false });
            rentals = rentalRows || [];
          }
        }
      }

      return json({
        user:           profile,
        company,
        twilio_numbers: twilioNumbers,
        rentals:        rentals,
        sms_credits:    smsCredits,
        lead_count:     leadCount,
      });
    }

    // ── action: get_platform_settings ─────────────────────────────────────────
    // Returns the shared Twilio number assigned to every company on
    // signup/rental activation (see provision-twilio). Configurable so it can
    // be swapped without a code deploy.
    if (action === "get_platform_settings") {
      const { data: settings, error: settingsErr } = await adminClient
        .from("platform_settings")
        .select("shared_twilio_number")
        .eq("id", 1)
        .maybeSingle();
      if (settingsErr) {
        console.error("get_platform_settings error:", settingsErr.message);
        return json({ error: "Failed to load platform settings" }, 500);
      }
      return json({ shared_twilio_number: settings?.shared_twilio_number ?? null });
    }

    // ── action: update_platform_settings ──────────────────────────────────────
    // Changes the shared Twilio number. Only affects companies provisioned
    // AFTER the change - existing twilio_numbers/sms_agent_config rows keep
    // whatever number they were assigned (reassign them individually via the
    // Twilio Numbers pool below if a full migration is needed).
    if (action === "update_platform_settings") {
      const { shared_twilio_number } = body as { shared_twilio_number?: string };
      const number = (shared_twilio_number || "").trim();
      if (!/^\+[1-9]\d{6,14}$/.test(number)) {
        return json({ error: "shared_twilio_number must be a valid E.164 number, e.g. +61485016260" }, 400);
      }
      const { error: upsertErr } = await adminClient
        .from("platform_settings")
        .upsert({ id: 1, shared_twilio_number: number, updated_at: new Date().toISOString() });
      if (upsertErr) {
        console.error("update_platform_settings error:", upsertErr.message);
        return json({ error: "Failed to update platform settings: " + upsertErr.message }, 500);
      }
      return json({ success: true, shared_twilio_number: number });
    }

    // ── action: list_twilio_numbers ───────────────────────────────────────────
    // Returns all Twilio numbers with their assigned company.
    if (action === "list_twilio_numbers") {
      const { data: numbers, error: numErr } = await adminClient
        .from("twilio_numbers")
        .select("id, phone_number, friendly_name, company_id, created_at, company:companies(id, name)")
        .order("created_at", { ascending: false });

      if (numErr) {
        console.error("list_twilio_numbers error:", numErr.message);
        return json({ error: "Failed to load Twilio numbers" }, 500);
      }

      return json({ numbers: numbers || [] });
    }

    // ── action: update_twilio_number ──────────────────────────────────────────
    // Reassigns a Twilio number to a different company or updates friendly_name.
    if (action === "update_twilio_number") {
      const { number_id, company_id, friendly_name } = body as {
        number_id?: string;
        company_id?: string;
        friendly_name?: string;
      };

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!number_id || !UUID_RE.test(number_id)) {
        return json({ error: "number_id must be a valid UUID" }, 400);
      }

      const update: Record<string, unknown> = {};
      if (company_id !== undefined) {
        if (company_id && !UUID_RE.test(company_id)) {
          return json({ error: "company_id must be a valid UUID or empty" }, 400);
        }
        update.company_id = company_id || null;
      }
      if (friendly_name !== undefined) update.friendly_name = friendly_name.trim() || null;

      if (!Object.keys(update).length) return json({ success: true });

      // Snapshot the row before reassignment so the agent configs can be synced.
      let prevRow: { phone_number: string; company_id: string | null } | null = null;
      if (company_id !== undefined) {
        const { data } = await adminClient
          .from("twilio_numbers")
          .select("phone_number, company_id")
          .eq("id", number_id)
          .maybeSingle();
        prevRow = data as typeof prevRow;
      }

      const { error: updateErr } = await adminClient
        .from("twilio_numbers")
        .update(update)
        .eq("id", number_id);

      if (updateErr) {
        console.error("update_twilio_number error:", updateErr.message);
        return json({ error: "Failed to update number: " + updateErr.message }, 500);
      }

      // Keep sms_agent_config wired to the numbers companies actually own.
      if (company_id !== undefined && prevRow) {
        const newCompanyId = company_id || null;
        if (prevRow.company_id && prevRow.company_id !== newCompanyId) {
          // Number moved away - clear the old company's config if it used it.
          await adminClient
            .from("sms_agent_config")
            .update({ twilio_number: null })
            .eq("company_id", prevRow.company_id)
            .eq("twilio_number", prevRow.phone_number);
        }
        if (newCompanyId) {
          await syncAgentTwilioNumber(adminClient, newCompanyId, prevRow.phone_number);
        }
      }

      return json({ success: true });
    }

    // ── action: add_twilio_number ─────────────────────────────────────────────
    // Manually registers an existing Twilio number and optionally pairs it with a company.
    if (action === "add_twilio_number") {
      const { phone_number, friendly_name, company_id } = body as {
        phone_number?: string;
        friendly_name?: string;
        company_id?: string;
      };

      if (!phone_number || !phone_number.trim()) {
        return json({ error: "phone_number is required" }, 400);
      }

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (company_id && !UUID_RE.test(company_id)) {
        return json({ error: "company_id must be a valid UUID" }, 400);
      }

      const insert: Record<string, unknown> = { phone_number: phone_number.trim() };
      if (friendly_name?.trim()) insert.friendly_name = friendly_name.trim();
      if (company_id) insert.company_id = company_id;

      const { data: newNumber, error: insertErr } = await adminClient
        .from("twilio_numbers")
        .insert(insert)
        .select("id, phone_number, friendly_name, company_id, created_at, company:companies(id, name)")
        .single();

      if (insertErr) {
        console.error("add_twilio_number error:", insertErr.message);
        return json({ error: "Failed to add number: " + insertErr.message }, 500);
      }

      if (company_id) {
        await syncAgentTwilioNumber(adminClient, company_id, phone_number.trim());
      }

      return json({ success: true, number: newNumber });
    }

    // ── action: delete_twilio_number ──────────────────────────────────────────
    // Removes a Twilio number from the pool. Best-effort releases the number on
    // Twilio (to stop billing) when its SID and account credentials are known,
    // clears any agent config that referenced it, then deletes the DB row.
    if (action === "delete_twilio_number") {
      const { number_id, release_on_twilio } = body as {
        number_id?: string;
        release_on_twilio?: boolean;
      };

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!number_id || !UUID_RE.test(number_id)) {
        return json({ error: "number_id must be a valid UUID" }, 400);
      }

      // Snapshot the row so we can release it on Twilio and unwire agent configs.
      const { data: row, error: rowErr } = await adminClient
        .from("twilio_numbers")
        .select("id, phone_number, company_id, twilio_sid")
        .eq("id", number_id)
        .maybeSingle();

      if (rowErr) {
        console.error("delete_twilio_number lookup error:", rowErr.message);
        return json({ error: "Failed to load number: " + rowErr.message }, 500);
      }
      if (!row) {
        return json({ error: "Number not found" }, 404);
      }

      const numberRow = row as {
        phone_number: string;
        company_id: string | null;
        twilio_sid: string | null;
      };

      // Never release a number on Twilio while another company row still
      // references the same phone_number - it's a shared number and
      // releasing it would cut off every other company using it, even if
      // this particular row happens to carry a twilio_sid from before it
      // was shared.
      const { count: sharedCount } = await adminClient
        .from("twilio_numbers")
        .select("id", { count: "exact", head: true })
        .eq("phone_number", numberRow.phone_number)
        .neq("id", number_id);
      const isShared = (sharedCount ?? 0) > 0;

      // Best-effort release the number on Twilio so billing stops. Defaults to
      // true; callers can pass release_on_twilio: false to only drop the record.
      let twilioReleased = false;
      let twilioError: string | null = null;
      const shouldRelease = release_on_twilio !== false && !isShared;
      if (shouldRelease && numberRow.twilio_sid) {
        const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        if (accountSid && authToken) {
          try {
            const creds = btoa(`${accountSid}:${authToken}`);
            const relRes = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${numberRow.twilio_sid}.json`,
              { method: "DELETE", headers: { Authorization: `Basic ${creds}` } },
            );
            // 204 = released; 404 = already gone on Twilio, treat as released.
            if (relRes.status === 204 || relRes.status === 404) {
              twilioReleased = true;
            } else {
              twilioError = `Twilio returned HTTP ${relRes.status}`;
              console.warn("delete_twilio_number: " + twilioError);
            }
          } catch (e) {
            twilioError = (e as Error).message;
            console.warn("delete_twilio_number: Twilio release threw:", twilioError);
          }
        } else {
          twilioError = "Twilio credentials not configured";
          console.warn("delete_twilio_number: " + twilioError);
        }
      }

      // Unwire the agent config for the company this row belonged to. Scoped
      // to that one company_id (not just phone_number) because the same
      // number can be shared across many companies - matching on
      // phone_number alone would unwire every other company still legitimately
      // assigned to this number.
      if (numberRow.company_id) {
        const { error: cfgErr } = await adminClient
          .from("sms_agent_config")
          .update({ twilio_number: null })
          .eq("company_id", numberRow.company_id)
          .eq("twilio_number", numberRow.phone_number);
        if (cfgErr) console.warn("delete_twilio_number: agent unwire failed:", cfgErr.message);
      }

      // Drop the pool record.
      const { error: delErr } = await adminClient
        .from("twilio_numbers")
        .delete()
        .eq("id", number_id);

      if (delErr) {
        console.error("delete_twilio_number error:", delErr.message);
        return json({ error: "Failed to delete number: " + delErr.message }, 500);
      }

      return json({ success: true, twilio_released: twilioReleased, twilio_error: twilioError });
    }

    // ── action: update_user ───────────────────────────────────────────────────
    // Updates email (auth.users) and/or full_name/is_admin (profiles) for any user.
    if (action === 'update_user') {
      const { user_id, full_name, email, is_admin } = body as {
        user_id?: string;
        full_name?: string;
        email?: string;
        is_admin?: boolean;
      };

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!user_id || typeof user_id !== 'string' || !UUID_RE.test(user_id)) {
        return json({ error: 'user_id must be a valid UUID' }, 400);
      }
      if (full_name !== undefined && (typeof full_name !== 'string' || full_name.trim().length === 0 || full_name.length > 200)) {
        return json({ error: 'full_name must be 1–200 characters' }, 400);
      }
      if (email !== undefined) {
        const e = (email || '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
          return json({ error: 'Invalid email address' }, 400);
        }
      }
      // Prevent an admin from stripping their own admin flag
      if (user_id === caller.id && is_admin === false) {
        return json({ error: 'Cannot remove your own super-admin access' }, 400);
      }

      // Update email in auth.users
      if (email !== undefined) {
        const cleanEmail = email.trim().toLowerCase();
        const { error: emailErr } = await adminClient.auth.admin.updateUserById(user_id, { email: cleanEmail });
        if (emailErr) {
          console.error('update_user email error:', emailErr.message);
          return json({ error: 'Failed to update email: ' + emailErr.message }, 500);
        }
      }

      // Update profile fields
      const profileUpdate: Record<string, unknown> = {};
      if (full_name !== undefined) profileUpdate.full_name = full_name.trim();
      if (is_admin  !== undefined) profileUpdate.is_admin  = !!is_admin;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileErr } = await adminClient
          .from('profiles')
          .update(profileUpdate)
          .eq('id', user_id);
        if (profileErr) {
          console.error('update_user profile error:', profileErr.message);
          return json({ error: 'Failed to update profile: ' + profileErr.message }, 500);
        }
      }


      return json({ success: true, user_id });
    }

    // ── action: delete_user ───────────────────────────────────────────────────
    // Permanently deletes a user from auth.users (cascades to profiles).
    if (action === "delete_user") {
      const { user_id } = body as { user_id?: string };

      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!user_id || !UUID_RE.test(user_id)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }
      if (user_id === caller.id) {
        return json({ error: "Cannot delete your own account" }, 400);
      }

      const { error: deleteErr } = await adminClient.auth.admin.deleteUser(user_id);
      if (deleteErr) {
        console.error("delete_user error:", deleteErr.message);
        return json({ error: "Failed to delete user: " + deleteErr.message }, 500);
      }

      return json({ success: true });
    }

    // ── action: delete_company ────────────────────────────────────────────────
    // Permanently delete a company and ALL its data. Deleting the company row
    // cascades every company-scoped table (profiles, va assignments,
    // notes, etc.); we then remove the company's auth users so none are orphaned.
    // Already gated to super-admins (is_admin check at the top of this function).
    if (action === "delete_company") {
      const { company_id } = body as { company_id?: string };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!company_id || !UUID_RE.test(company_id)) {
        return json({ error: "company_id must be a valid UUID" }, 400);
      }

      // Never let an admin delete the company they belong to (would delete them).
      const { data: myProfile } = await adminClient
        .from("profiles").select("company_id").eq("id", caller.id).maybeSingle();
      if (myProfile?.company_id === company_id) {
        return json({ error: "Cannot delete your own company" }, 400);
      }

      // Capture the company's users before the cascade removes their profiles.
      const { data: members } = await adminClient
        .from("profiles").select("id").eq("company_id", company_id);
      const memberIds = (members || []).map((m: { id: string }) => m.id);

      // Delete the company - cascades all company-scoped rows.
      const { error: delErr } = await adminClient
        .from("companies").delete().eq("id", company_id);
      if (delErr) {
        console.error("delete_company error:", delErr.message);
        return json({ error: "Failed to delete company: " + delErr.message }, 500);
      }

      // Best-effort cleanup of the now-orphaned auth users.
      for (const uid of memberIds) {
        if (uid === caller.id) continue;
        const { error: authErr } = await adminClient.auth.admin.deleteUser(uid);
        if (authErr) console.warn("delete_company: auth cleanup failed for", uid, authErr.message);
      }

      return json({ success: true });
    }

    // ── action: mark_inactive ────────────────────────────────────────────────
    // Sets or clears the inactive_marked_at timestamp on a user's profile.
    if (action === "mark_inactive") {
      const { user_id, inactive } = body as { user_id?: string; inactive?: boolean };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!user_id || !UUID_RE.test(user_id)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }
      if (user_id === caller.id) {
        return json({ error: "Cannot mark yourself inactive" }, 400);
      }

      const update: Record<string, unknown> = inactive === false
        ? { inactive_marked_at: null, deletion_notice_sent_at: null, deletion_token: null }
        : { inactive_marked_at: new Date().toISOString() };

      const { error: upErr } = await adminClient
        .from("profiles")
        .update(update)
        .eq("id", user_id);
      if (upErr) {
        console.error("mark_inactive error:", upErr.message);
        return json({ error: "Failed to update: " + upErr.message }, 500);
      }

      return json({ success: true, inactive_marked_at: inactive === false ? null : update.inactive_marked_at });
    }

    // ── action: send_deletion_notice ─────────────────────────────────────────
    // Sends a 7-day deletion warning email and generates a magic link for
    // instant account deletion. Records the timestamp and token on the profile.
    if (action === "send_deletion_notice") {
      const { user_id } = body as { user_id?: string };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!user_id || !UUID_RE.test(user_id)) {
        return json({ error: "user_id must be a valid UUID" }, 400);
      }
      if (user_id === caller.id) {
        return json({ error: "Cannot send deletion notice to yourself" }, 400);
      }

      // Look up the user's email and profile
      const { data: { user: targetUser }, error: userErr } =
        await adminClient.auth.admin.getUserById(user_id);
      if (userErr || !targetUser) {
        return json({ error: "User not found" }, 404);
      }
      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("id", user_id)
        .maybeSingle();

      // Generate a unique deletion token
      const deletionToken = crypto.randomUUID();

      // Save the token and notice timestamp
      const { error: upErr } = await adminClient
        .from("profiles")
        .update({
          deletion_notice_sent_at: new Date().toISOString(),
          deletion_token: deletionToken,
        })
        .eq("id", user_id);
      if (upErr) {
        console.error("send_deletion_notice update error:", upErr.message);
        return json({ error: "Failed to update profile: " + upErr.message }, 500);
      }

      // Build delete-now URL
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const deleteNowUrl = `${supabaseUrl}/functions/v1/delete-account?token=${deletionToken}`;

      // Build the email
      const userName = targetProfile?.full_name || "there";
      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f5f9">
<div style="max-width:520px;margin:40px auto;background:#fff;border-radius:16px;padding:40px;box-shadow:0 4px 16px rgba(0,0,0,.06)">
  <h1 style="font-size:20px;color:#121826;margin:0 0 16px">Account Inactivity Notice</h1>
  <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 16px">
    Hi ${userName},
  </p>
  <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 16px">
    Your Lead Gen Rentals account has been inactive for 30 days. As a result, <strong>your account and all associated data will be permanently deleted in 7 days</strong>.
  </p>
  <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 16px">
    If you'd like to keep your account, simply <strong>log in</strong> before the 7-day period ends. We also recommend exporting any leads you may need.
  </p>
  <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px">
    If you'd prefer to delete your account immediately instead of waiting 7 days, you can do so using the link below:
  </p>
  <div style="text-align:center;margin:0 0 24px">
    <a href="${deleteNowUrl}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:12px 28px;border-radius:10px;font-size:14px;font-weight:600">
      Delete My Account Now
    </a>
  </div>
  <p style="font-size:12px;color:#999;line-height:1.6;margin:0">
    If you did not expect this email or believe this is a mistake, please contact us at support@leadgenrentals.com.au.
  </p>
</div>
</body>
</html>`.trim();

      const emailText = `Hi ${userName},\n\nYour Lead Gen Rentals account has been inactive for 30 days. Your account and all associated data will be permanently deleted in 7 days.\n\nIf you'd like to keep your account, simply log in before the 7-day period ends. We also recommend exporting any leads you may need.\n\nTo delete your account immediately: ${deleteNowUrl}\n\nIf you believe this is a mistake, contact support@leadgenrentals.com.au.`;

      // Send via resend-email edge function
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const emailRes = await fetch(`${supabaseUrl}/functions/v1/resend-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          to: targetUser.email,
          subject: "Your Lead Gen Rentals account will be deleted in 7 days",
          html: emailHtml,
          text: emailText,
        }),
      });

      const emailData = await emailRes.json().catch(() => ({}));
      const emailSent = emailRes.ok && emailData.success;

      return json({
        success: true,
        email_sent: emailSent,
        email_error: emailSent ? undefined : (emailData.error || "Unknown email error"),
        deletion_notice_sent_at: new Date().toISOString(),
      });
    }

    // ── action: get_company_api_keys ────────────────────────────────────────
    if (action === "get_company_api_keys") {
      const { company_id } = body as { company_id?: string };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!company_id || !UUID_RE.test(company_id)) {
        return json({ error: "company_id must be a valid UUID" }, 400);
      }
      const { data, error: keysErr } = await adminClient
        .from("company_api_tokens")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false });
      if (keysErr) {
        return json({ error: "Failed to load API keys: " + keysErr.message }, 500);
      }
      return json({ keys: data || [] });
    }

    // ── action: create_company_api_key ───────────────────────────────────────
    if (action === "create_company_api_key") {
      const { company_id, name, scopes, expires_at, token_hash, token_prefix } = body as {
        company_id?: string;
        name?: string;
        scopes?: string[];
        expires_at?: string | null;
        token_hash?: string;
        token_prefix?: string;
      };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!company_id || !UUID_RE.test(company_id)) {
        return json({ error: "company_id must be a valid UUID" }, 400);
      }
      if (!name || !name.trim()) {
        return json({ error: "name is required" }, 400);
      }
      if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
        return json({ error: "At least one scope is required" }, 400);
      }
      if (!token_hash || !token_prefix) {
        return json({ error: "token_hash and token_prefix are required" }, 400);
      }
      const { error: insertErr } = await adminClient
        .from("company_api_tokens")
        .insert({
          company_id,
          token_hash,
          token_prefix,
          name: name.trim(),
          scopes,
          expires_at: expires_at || null,
        });
      if (insertErr) {
        return json({ error: "Failed to create API key: " + insertErr.message }, 500);
      }
      return json({ success: true });
    }

    // ── action: revoke_company_api_key ───────────────────────────────────────
    if (action === "revoke_company_api_key") {
      const { key_id } = body as { key_id?: string };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!key_id || !UUID_RE.test(key_id)) {
        return json({ error: "key_id must be a valid UUID" }, 400);
      }
      const { error: revokeErr } = await adminClient
        .from("company_api_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", key_id);
      if (revokeErr) {
        return json({ error: "Failed to revoke key: " + revokeErr.message }, 500);
      }
      return json({ success: true });
    }

    // ── action: get_sms_config ───────────────────────────────────────────────
    if (action === "get_sms_config") {
      const { company_id } = body as { company_id?: string };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!company_id || !UUID_RE.test(company_id)) {
        return json({ error: "company_id must be a valid UUID" }, 400);
      }
      const { data, error: cfgErr } = await adminClient
        .from("sms_agent_config")
        .select("*")
        .eq("company_id", company_id)
        .maybeSingle();
      if (cfgErr) {
        return json({ error: "Failed to load SMS config: " + cfgErr.message }, 500);
      }
      return json({ config: data });
    }

    // ── action: update_sms_config ────────────────────────────────────────────
    if (action === "update_sms_config") {
      const { company_id, system_prompt } = body as {
        company_id?: string;
        system_prompt?: string;
      };
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!company_id || !UUID_RE.test(company_id)) {
        return json({ error: "company_id must be a valid UUID" }, 400);
      }
      const { error: upsertErr } = await adminClient
        .from("sms_agent_config")
        .upsert(
          { company_id, system_prompt: system_prompt ?? "" },
          { onConflict: "company_id" }
        );
      if (upsertErr) {
        return json({ error: "Failed to update SMS config: " + upsertErr.message }, 500);
      }
      return json({ success: true });
    }

    // ── Unknown action ────────────────────────────────────────────────────────
    return json({ error: `Unknown action: ${action ?? "(none)"}` }, 400);
  } catch (err) {
    console.error("impersonate-user unhandled error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
