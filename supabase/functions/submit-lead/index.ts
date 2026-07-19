// ============================================================================
// submit-lead — public intake for LGR asset funnels (solar landing pages, etc.)
//
// A funnel form POSTs here. We validate + normalise, resolve which asset the
// form belongs to, then call the insert_lead() RPC — which attributes the lead
// to the asset's CURRENT renter and runs the strict 30-day dedup. On a fresh
// (non-duplicate) lead we fire deliver-lead so the installer gets it in real
// time. Everything shows up in the lgr-mc "Lead Distribution" panel.
//
// No client-matching / caps / fill-ratio (flat monthly rental — the lead's
// owner is simply whoever rents the asset).
//
// Request (JSON):
//   { asset_id | brand_domain,  full_name | name | first_name+last_name,
//     phone (required), email?, postcode?, ...any extra fields }
// Any field not in the core set is packed into leads.extra (bill, timeline,
// homeowner, interested_in, consent_text, suburb, state, utm_*, …).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normalise an AU phone number to E.164 (+61…). Keeps dedup consistent no matter
// how the form formats it. Returns null if it isn't a valid AU number.
function normalisePhone(raw: string): string | null {
  let p = (raw || "").replace(/[\s\-().]/g, "");
  if (p.startsWith("0") && p.length === 10) p = "+61" + p.slice(1);
  else if (p.startsWith("61") && !p.startsWith("+") && p.length === 11) p = "+" + p;
  else if (p.startsWith("+61") && p.length === 12) { /* already E.164 */ }
  if (/^\+61[2-9][0-9]{8}$/.test(p)) return p;
  return null;
}

// Core fields the leads table knows about by name; everything else → extra.
const CORE = new Set([
  "asset_id", "brand_domain", "asset_slug",
  "full_name", "name", "first_name", "last_name",
  "phone", "email", "postcode",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // ── name (accept full_name / name / first+last) ──────────────────────────
    let name = (body.full_name || body.name || "").toString().trim();
    if (!name && (body.first_name || body.last_name)) {
      name = [body.first_name, body.last_name].filter(Boolean).join(" ").trim();
    }
    if (!name) return json({ error: "missing_name" }, 400);

    // ── phone (required, normalised) ─────────────────────────────────────────
    const phone = normalisePhone((body.phone || "").toString());
    if (!phone) return json({ error: "invalid_phone" }, 400);

    // ── email (optional, validated if present) ───────────────────────────────
    let email: string | null = (body.email || "").toString().trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

    // ── postcode (optional, 4-digit AU) ──────────────────────────────────────
    let postcode: string | null = (body.postcode || "").toString().replace(/\s/g, "") || null;
    if (postcode && !/^[0-9]{4}$/.test(postcode)) return json({ error: "invalid_postcode" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── resolve the asset (by id, else by brand_domain) ──────────────────────
    let assetId: string | null = (body.asset_id || "").toString().trim() || null;
    if (!assetId && body.brand_domain) {
      const domain = String(body.brand_domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      const { data: a } = await supabase
        .from("assets").select("id")
        .ilike("brand_domain", domain).is("deleted_at", null).limit(1).maybeSingle();
      assetId = a?.id ?? null;
    }
    if (!assetId) return json({ error: "unknown_asset", detail: "provide asset_id or a matching brand_domain" }, 400);

    // ── pack any extra fields into leads.extra ───────────────────────────────
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!CORE.has(k) && v != null && String(v).trim() !== "") extra[k] = v;
    }

    // ── capture via insert_lead() — attribution + 30-day dedup live in the RPC ─
    const { data: lead, error } = await supabase.rpc("insert_lead", {
      p_asset_id: assetId,
      p_full_name: name,
      p_phone: phone,
      p_email: email,
      p_postcode: postcode,
      p_extra: extra,
    });

    if (error) {
      const msg = error.message || "insert_failed";
      // asset exists but nobody rents it right now → nothing to deliver to
      if (/not currently rented/i.test(msg)) return json({ error: "asset_not_rented" }, 409);
      if (/not found/i.test(msg)) return json({ error: "unknown_asset" }, 404);
      return json({ error: "insert_failed", detail: msg }, 400);
    }

    // ── real-time delivery for fresh leads (fire-and-forget) ─────────────────
    if (lead && !lead.is_duplicate && lead.status === "delivered") {
      supabase.functions.invoke("deliver-lead", { body: { lead_id: lead.id } })
        .catch((e: Error) => console.error("deliver-lead invoke failed:", e.message));
    }

    return json({
      success: true,
      lead_id: lead?.id ?? null,
      status: lead?.is_duplicate ? "duplicate" : "delivered",
      installer_id: lead?.installer_id ?? null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
