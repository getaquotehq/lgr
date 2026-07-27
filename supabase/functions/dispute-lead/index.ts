// =============================================================================
// LeadGenRentalsHQ - Dispute Lead
// =============================================================================
// Handles PPL lead dispute submissions with three auto-checked reasons:
//   • invalid_number        - validates phone via Veriphone API (E164)
//   • duplicate             - checks for same phone in company's lead pool
//   • outside_agreed_criteria - checks postcode against company's agreed list
//
// A second action (send_for_manual_review) can escalate an
// outside_agreed_criteria dispute to pending_manual_review after
// acknowledging the scrub-cap warning.
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

// ─── Phone normalisation (E164) ───────────────────────────────────────────────

function normaliseE164(raw: string): string {
  let phone = raw.replace(/[\s\-().]/g, "");
  if (phone.startsWith("+")) return phone;
  if (phone.startsWith("0")) return "+61" + phone.slice(1);
  if (/^\d{9}$/.test(phone)) return "+61" + phone;
  return phone;
}

// ─── Veriphone lookup ─────────────────────────────────────────────────────────

interface VeriphoneResult {
  valid: boolean;
  type: string | null;
  international: string | null;
  raw: unknown;
}

async function checkVeriphone(phone: string): Promise<VeriphoneResult> {
  const key = Deno.env.get("VERIPHONE_API_KEY");
  if (!key) {
    console.warn("VERIPHONE_API_KEY not set - skipping live check");
    return { valid: false, type: null, international: null, raw: { error: "api_key_missing" } };
  }

  const url = `https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(phone)}&key=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Veriphone HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    return {
      valid:         data.phone_valid === true,
      type:          (data.phone_type as string) ?? null,
      international: (data.international_number as string) ?? null,
      raw:           data,
    };
  } catch (err) {
    console.error("Veriphone error:", err);
    return { valid: false, type: null, international: null, raw: { error: String(err) } };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")    return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth header" }, 401);

  // Authenticated client - respects RLS
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  // Service-role client - used for writes that bypass RLS
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Identify caller ───────────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorised" }, 401);

    const { data: profile } = await db
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) return json({ error: "No company found for user" }, 403);

    const companyId = profile.company_id;

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = await req.json() as {
      action?: string;            // 'dispute' | 'manual_review'
      lead_id?: string;
      dispute_id?: string;
      reason?: string;
    };

    // ── Action: escalate existing dispute to manual review ────────────────────
    if (body.action === "manual_review") {
      return await handleManualReview(db, body.dispute_id!, companyId, user.id);
    }

    // ── Action: create dispute (default) ──────────────────────────────────────
    const { lead_id, reason } = body;

    if (!lead_id)  return json({ error: "lead_id is required" }, 400);
    if (!reason)   return json({ error: "reason is required" }, 400);

    const validReasons = ["invalid_number", "duplicate", "outside_agreed_criteria"];
    if (!validReasons.includes(reason)) {
      return json({ error: `reason must be one of: ${validReasons.join(", ")}` }, 400);
    }

    // ── Fetch lead (verify it exists, is PPL, belongs to company) ─────────────
    const { data: lead, error: leadErr } = await db
      .from("leads")
      .select("id, company_id, is_ppl, phone, postcode, name, created_at, ppl_scrubbed")
      .eq("id", lead_id)
      .single();

    if (leadErr || !lead)              return json({ error: "Lead not found" }, 404);
    if (lead.company_id !== companyId) return json({ error: "Forbidden" }, 403);
    if (!lead.is_ppl)                  return json({ error: "Only PPL leads can be disputed" }, 422);
    if (lead.ppl_scrubbed)             return json({ error: "This lead has already been scrubbed and credited - it can't be disputed" }, 422);

    // ── Check dispute eligibility (7-day window + 24h call rule) ─────────────
    const { data: eligibility } = await db
      .rpc("get_ppl_dispute_eligibility", { p_lead_id: lead_id });

    if (!eligibility?.dispute_window_open) {
      return json({
        error: "Dispute window has closed. Disputes must be raised within 7 days of lead delivery.",
        eligibility,
      }, 422);
    }

    const eligibleReasons: string[] = eligibility?.eligible_reasons ?? [];
    if (!eligibleReasons.includes(reason)) {
      // The most common case: invalid_number requested but no 24h call logged
      if (reason === "invalid_number" && !eligibility?.call_within_24h) {
        return json({
          error: "Invalid number disputes require at least one call attempt to be logged within 24 hours of lead delivery.",
          eligibility,
        }, 422);
      }
      return json({
        error: `The reason '${reason}' is not currently eligible for this lead.`,
        eligibility,
      }, 422);
    }

    // ── Block duplicate dispute attempts ──────────────────────────────────────
    const { data: existing } = await db
      .from("lead_disputes")
      .select("id, status")
      .eq("lead_id", lead_id)
      .in("status", ["pending", "auto_approved", "pending_manual_review", "manual_approved"])
      .maybeSingle();

    if (existing) {
      return json({
        error: "This lead already has an active or approved dispute",
        dispute_id: existing.id,
        dispute_status: existing.status,
      }, 409);
    }

    // ── Fetch company config ──────────────────────────────────────────────────
    const { data: company } = await db
      .from("companies")
      .select("ppl_agreed_postcodes, ppl_scrub_cap_pct")
      .eq("id", companyId)
      .single();

    // Judge "outside agreed criteria" against the service area that was in
    // effect WHEN THIS LEAD WAS DELIVERED (lead.created_at), not the company's
    // current area - so changing service areas later can't retroactively make an
    // old, in-area lead disputable. Falls back to the current area if the
    // point-in-time lookup is unavailable.
    let agreedPostcodes: string[] = company?.ppl_agreed_postcodes ?? [];
    try {
      const { data: histPostcodes, error: histErr } = await db.rpc(
        "ppl_agreed_postcodes_at",
        { p_company_id: companyId, p_at: lead.created_at },
      );
      if (!histErr && Array.isArray(histPostcodes)) {
        agreedPostcodes = histPostcodes as string[];
      }
    } catch (_e) { /* keep current-area fallback */ }

    // ── Auto-check ────────────────────────────────────────────────────────────
    let autoCheckResult: Record<string, unknown> = {};
    let disputeStatus: string;

    if (reason === "invalid_number") {
      if (!lead.phone) {
        autoCheckResult = { checked: false, note: "Lead has no phone number on record" };
        disputeStatus = "auto_approved"; // no phone = invalid
      } else {
        const normalised = normaliseE164(lead.phone);
        const veriResult = await checkVeriphone(normalised);
        autoCheckResult = {
          checked:             true,
          normalised_phone:    normalised,
          phone_valid:         veriResult.valid,
          phone_type:          veriResult.type,
          international:       veriResult.international,
          veriphone_raw:       veriResult.raw,
        };
        // Dispute approved if Veriphone says the number is invalid
        disputeStatus = veriResult.valid ? "auto_rejected" : "auto_approved";
      }

    } else if (reason === "duplicate") {
      if (!lead.phone) {
        autoCheckResult = { checked: false, note: "Lead has no phone number - cannot check for duplicates" };
        disputeStatus = "auto_rejected";
      } else {
        const normalised = normaliseE164(lead.phone);
        const { data: dups } = await db
          .from("leads")
          .select("id, name, created_at")
          .eq("company_id", companyId)
          .neq("id", lead_id)
          .or(`phone.eq.${lead.phone},phone.eq.${normalised}`)
          .order("created_at", { ascending: true })
          .limit(5);

        const hasDuplicate = (dups?.length ?? 0) > 0;
        autoCheckResult = {
          checked:           true,
          normalised_phone:  normalised,
          duplicate_found:   hasDuplicate,
          duplicate_leads:   dups?.map((d) => ({ id: d.id, name: d.name, created_at: d.created_at })) ?? [],
        };
        disputeStatus = hasDuplicate ? "auto_approved" : "auto_rejected";
      }

    } else {
      // outside_agreed_criteria
      const leadPostcode = (lead.postcode ?? "").trim().toUpperCase();
      const normalised = agreedPostcodes.map((p) => p.trim().toUpperCase());
      const noConfig    = normalised.length === 0;
      const isOutside   = !noConfig && !normalised.includes(leadPostcode);

      autoCheckResult = {
        checked:            !noConfig,
        lead_postcode:      leadPostcode,
        agreed_postcodes:   agreedPostcodes,
        area_effective_at:  lead.created_at, // area judged as of lead delivery
        postcode_outside:   isOutside,
        no_config:          noConfig,
        note: noConfig
          ? "No agreed postcodes configured for this company - manual review required"
          : isOutside
            ? "Lead postcode is outside the company's agreed territory"
            : "Lead postcode is within the company's agreed territory",
      };

      // If outside territory or no config → auto approved; if inside → rejected
      // (edge case: no config means we can't confirm, so it goes to auto_approved
      //  to allow the manual review path)
      disputeStatus = (isOutside || noConfig) ? "auto_approved" : "auto_rejected";
    }

    // ── Insert dispute ────────────────────────────────────────────────────────
    const { data: dispute, error: insertErr } = await db
      .from("lead_disputes")
      .insert({
        lead_id,
        company_id:       companyId,
        raised_by:        user.id,
        reason,
        status:           disputeStatus,
        auto_check_result: autoCheckResult,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Insert dispute error:", insertErr);
      return json({ error: "Failed to record dispute" }, 500);
    }

    // ── Scrub cap info (always return so UI can show it) ──────────────────────
    const { data: scrubUsage } = await db
      .rpc("get_ppl_scrub_usage", { p_company_id: companyId });

    return json({
      dispute_id:              dispute.id,
      status:                  disputeStatus,
      reason,
      auto_check_result:       autoCheckResult,
      scrub_usage:             scrubUsage,
      eligibility,
      manual_review_available: reason === "outside_agreed_criteria",
    });

  } catch (err) {
    console.error("dispute-lead error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});

// ─── Manual review escalation ─────────────────────────────────────────────────

async function handleManualReview(
  db: ReturnType<typeof createClient>,
  disputeId: string,
  companyId: string,
  userId: string,
): Promise<Response> {
  if (!disputeId) return json({ error: "dispute_id is required" }, 400);

  // Fetch the dispute
  const { data: dispute, error: fetchErr } = await db
    .from("lead_disputes")
    .select("id, company_id, reason, status, lead_id")
    .eq("id", disputeId)
    .single();

  if (fetchErr || !dispute) return json({ error: "Dispute not found" }, 404);
  if (dispute.company_id !== companyId) return json({ error: "Forbidden" }, 403);

  if (dispute.reason !== "outside_agreed_criteria") {
    return json({ error: "Only outside_agreed_criteria disputes can be sent for manual review" }, 422);
  }

  if (!["auto_approved", "auto_rejected"].includes(dispute.status)) {
    return json({ error: `Dispute is already in status: ${dispute.status}` }, 409);
  }

  // Check scrub cap
  const { data: scrubUsage } = await db
    .rpc("get_ppl_scrub_usage", { p_company_id: companyId });

  if (scrubUsage?.cap_exceeded) {
    return json({
      error:        "Scrub cap exceeded",
      scrub_usage:  scrubUsage,
      cap_exceeded: true,
    }, 422);
  }

  // Escalate
  const { error: updateErr } = await db
    .from("lead_disputes")
    .update({
      status:     "pending_manual_review",
      scrub_cap_pct:  scrubUsage?.scrub_cap_pct ?? null,
      scrub_used_pct: scrubUsage?.scrub_used_pct ?? null,
    })
    .eq("id", disputeId);

  if (updateErr) {
    console.error("Manual review update error:", updateErr);
    return json({ error: "Failed to escalate dispute" }, 500);
  }

  return json({
    dispute_id:   disputeId,
    status:       "pending_manual_review",
    scrub_usage:  scrubUsage,
  });
}
