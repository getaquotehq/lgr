// =============================================================================
// LeadGenRentalsHQ - Sign-Up with Activation Key
// =============================================================================
// Creates a new user account after validating the activation key server-side.
// The activation key is stored as a Supabase Edge Function secret
// (SIGNUP_ACTIVATION_KEY) and is never exposed to the client.
//
// Payload: { email, password, full_name, company_name, activation_key, cf_turnstile_response }
// No auth required - this is a public endpoint for unauthenticated users.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function verifyTurnstile(token: string): Promise<boolean> {
  const secret = Deno.env.get("CF_TURNSTILE_SECRET");
  if (!secret) {
    console.error("CF_TURNSTILE_SECRET is not set");
    return false;
  }
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    },
  );
  const data = await res.json();
  return data.success === true;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
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
    const { email, password, full_name, company_name, activation_key, cf_turnstile_response } =
      await req.json();

    // ── Verify Turnstile CAPTCHA ──────────────────────────────────────────
    if (!cf_turnstile_response || typeof cf_turnstile_response !== "string") {
      return jsonResponse({ error: "CAPTCHA verification is required." }, 400);
    }
    const turnstileOk = await verifyTurnstile(cf_turnstile_response);
    if (!turnstileOk) {
      return jsonResponse({ error: "CAPTCHA verification failed. Please try again." }, 403);
    }

    // ── Validate required fields ──────────────────────────────────────────
    if (!email || typeof email !== "string") {
      return jsonResponse({ error: "Email is required." }, 400);
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return jsonResponse(
        { error: "Password is required and must be at least 6 characters." },
        400,
      );
    }
    if (!full_name || typeof full_name !== "string") {
      return jsonResponse({ error: "Full name is required." }, 400);
    }
    if (!company_name || typeof company_name !== "string") {
      return jsonResponse({ error: "Company name is required." }, 400);
    }
    if (!activation_key || typeof activation_key !== "string") {
      return jsonResponse({ error: "Activation key is required." }, 400);
    }

    // ── Validate activation key against server-side secret ────────────────
    const expectedKey = Deno.env.get("SIGNUP_ACTIVATION_KEY");
    if (!expectedKey) {
      console.error("SIGNUP_ACTIVATION_KEY is not set in edge function secrets");
      return jsonResponse(
        { error: "Sign-up is not configured. Please contact support." },
        503,
      );
    }

    // Constant-time comparison to prevent timing attacks
    const keyBytes = new TextEncoder().encode(activation_key.trim());
    const expectedBytes = new TextEncoder().encode(expectedKey.trim());

    let isMatch = keyBytes.length === expectedBytes.length;
    const len = expectedBytes.length;
    for (let i = 0; i < len; i++) {
      if ((keyBytes[i] ?? 0) !== expectedBytes[i]) {
        isMatch = false;
      }
    }

    if (!isMatch) {
      return jsonResponse({ error: "Invalid activation key." }, 403);
    }

    // ── Create user via Supabase Admin API ────────────────────────────────
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: newUser, error: createError } =
      await adminClient.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true, // Auto-confirm so user can sign in immediately
        user_metadata: {
          full_name: full_name.trim(),
          company_name: company_name.trim(),
          user_type: "internal",
        },
      });

    if (createError) {
      // Check for duplicate email
      if (/already|exists|duplicate|unique/i.test(createError.message)) {
        return jsonResponse(
          { error: "An account with this email already exists. Please sign in instead." },
          409,
        );
      }
      console.error("User creation error:", createError.message);
      return jsonResponse(
        { error: "Failed to create account. Please try again." },
        500,
      );
    }

    if (!newUser?.user) {
      console.error("User creation returned no user object");
      return jsonResponse(
        { error: "Failed to create account. Please try again." },
        500,
      );
    }

    console.log(
      `New user created: ${newUser.user.id} (${email}) - company: ${company_name}`,
    );

    // The handle_new_user() database trigger automatically:
    // 1. Creates a new company with the provided company_name
    // 2. Creates a profile linked to that company with role 'owner'
    // NOTE: Welcome email is currently disabled (migration 20260401000020)

    return jsonResponse(
      {
        success: true,
        message: "Account created successfully. You can now sign in.",
      },
      200,
    );
  } catch (err) {
    console.error("signup error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
