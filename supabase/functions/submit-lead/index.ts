// ============================================================================
// submit-lead — public intake for LGR asset funnels (the solar landing pages).
//
// Area-exclusive rental model. A funnel form POSTs here; we validate + normalise
// then resolve WHICH asset the lead belongs to using ql-mc-style consent-bound
// routing, adapted for LGR:
//
//   1. Candidate assets = live (rented) assets, optionally narrowed by the
//      funnel's brand_domain and/or niche.
//   2. POSTCODE gate — the lead's postcode must fall inside a candidate's
//      effective service area (assets.service_postcodes, else its region's
//      postcodes). An empty patch means "no coverage" (never match-all), exactly
//      like ql-mc treats an empty clients.postcodes list.
//   3. COMPANY-NAME-IN-CONSENT gate — the lead's consent sentence must name the
//      business it will be delivered to (the asset's current renter, or the
//      funnel brand). This is what proves exclusivity at the point of capture:
//      the homeowner consented to THAT business by name. Same longest-match
//      logic as ql-mc's consent-bound routing.
//
// The winning asset's CURRENT renter (assets.rented_by) owns the lead. We call
// insert_lead() (attribution + strict 30-day dedup), then fire deliver-lead so
// the installer gets it in real time. Everything surfaces in the lgr-mc
// "Lead Distribution" panel.
//
// Request (JSON):
//   { brand_domain? | asset_id?,  niche? | lead_type?,
//     full_name | name | first_name+last_name,
//     phone (required), postcode (required), email?, consent_text?, ...extra }
// Any field not in the core set is packed into leads.extra.
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

// Normalise an AU phone number to E.164 (+61…). Returns null if not a valid AU number.
function normalisePhone(raw: string): string | null {
  let p = (raw || "").replace(/[\s\-().]/g, "");
  if (p.startsWith("0") && p.length === 10) p = "+61" + p.slice(1);
  else if (p.startsWith("61") && !p.startsWith("+") && p.length === 11) p = "+" + p;
  if (/^\+61[2-9][0-9]{8}$/.test(p)) return p;
  return null;
}

// ── Consent-bound routing helpers (ported from ql-mc submit-lead) ────────────
// Normalise free text for name matching: lowercase, drop punctuation, collapse
// whitespace. Keeps '&' since it's common in trading names.
function normaliseText(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9& ]+/g, " ").replace(/\s+/g, " ").trim();
}
// Same, but also strips common legal suffixes so "Yagi Solar Pty Ltd" → "yagi solar".
function normaliseName(n: string): string {
  return normaliseText(n).replace(/\b(pty\s*ltd|pty|ltd|inc|llc|co)\b/g, " ").replace(/\s+/g, " ").trim();
}
// Pull the consent sentence off the body. Returns it normalised, or null.
function getConsentText(body: Record<string, unknown>): string | null {
  const direct = body?.consent_text;
  if (typeof direct === "string" && direct.trim()) return normaliseText(direct);
  return null;
}
// Longest of a business's names (renter business_name / funnel brand_name) that
// appears in the consent text, or "" if none does. Length lets us prefer the
// most specific match when one name is a substring of another.
function longestNameInConsent(names: (string | null | undefined)[], consentText: string): string {
  let best = "";
  for (const raw of names) {
    const n = normaliseName(raw || "");
    if (n.length >= 3 && consentText.includes(n) && n.length > best.length) best = n;
  }
  return best;
}

// Core fields the leads table knows about by name; everything else → extra.
// (website/hp/elapsed_ms are anti-spam signals — consumed here, never stored.)
const CORE = new Set([
  "asset_id", "brand_domain", "asset_slug", "niche", "lead_type",
  "full_name", "name", "first_name", "last_name",
  "phone", "email", "postcode",
  "website", "hp", "elapsed_ms",
]);

// Known disposable / throwaway email domains — a cheap hard spam block.
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "trashmail.com", "yopmail.com", "sharklasers.com", "getnada.com", "dispostable.com",
  "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mailnesia.com", "emailondeck.com",
]);

// Real-number check via the Veriphone API (https://veriphone.io). Confirms the
// number exists and is a mobile before we ever create a lead. Fails OPEN when the
// key is unset or the API is unreachable, so an outage never blocks real leads —
// set VERIPHONE_API_KEY to turn the hard block on.
async function veriphoneCheck(phone: string): Promise<{ checked: boolean; valid: boolean; mobile: boolean; type: string }> {
  const key = Deno.env.get("VERIPHONE_API_KEY");
  if (!key) return { checked: false, valid: true, mobile: true, type: "" };
  try {
    const url = `https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(phone)}&key=${key}&default_country=AU`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { checked: false, valid: true, mobile: true, type: "" };
    const d = await res.json();
    const type = String(d.phone_type || "");
    const valid = d.phone_valid === true;
    const mobile = type === "mobile" || type === "fixed_line_or_mobile";
    return { checked: true, valid, mobile, type };
  } catch {
    return { checked: false, valid: true, mobile: true, type: "" };
  }
}

type AssetRow = {
  id: string;
  brand_name: string;
  brand_domain: string | null;
  region_id: string | null;
  rented_by: string | null;
  service_postcodes: string[] | null;
};

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
    const email: string | null = (body.email || "").toString().trim() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "invalid_email" }, 400);

    // ── postcode (required, 4-digit AU — the whole model is postcode-matched) ─
    const postcode: string = (body.postcode || "").toString().replace(/\s/g, "");
    if (!/^[0-9]{4}$/.test(postcode)) return json({ error: "invalid_postcode" }, 400);

    // ── hard anti-spam gate ──────────────────────────────────────────────────
    // Silent drops (bots get a fake 200 so they don't learn they were caught);
    // only the real-number failure is surfaced, so a genuine user can fix a typo.
    // 1) honeypot — a hidden field only bots fill.
    if ((body.website || body.hp || "").toString().trim()) {
      return json({ success: true, status: "ok", stored: false });
    }
    // 2) time-to-complete — a human can't fill this form in under ~2.5s.
    const elapsedMs = Number(body.elapsed_ms || 0);
    if (elapsedMs > 0 && elapsedMs < 2500) {
      return json({ success: true, status: "ok", stored: false });
    }
    // 3) disposable / throwaway email domains.
    if (email) {
      const dom = (email.split("@")[1] || "").toLowerCase();
      if (DISPOSABLE.has(dom)) return json({ success: true, status: "ok", stored: false });
    }
    // 4) real-number check (Veriphone) — must be a valid, reachable mobile.
    const vp = await veriphoneCheck(phone);
    if (vp.checked && !(vp.valid && vp.mobile)) {
      return json({ error: "invalid_phone_number", detail: vp.type || "not a valid mobile" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── pack any extra fields into leads.extra ───────────────────────────────
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!CORE.has(k) && v != null && String(v).trim() !== "") extra[k] = v;
    }

    // ── build the candidate set (live, rented assets) ────────────────────────
    // A lead can only be delivered to an asset that's currently rented, so the
    // renter's business name is the consent target. Optionally narrow by the
    // funnel's brand_domain and/or the lead's niche.
    let q = supabase
      .from("assets")
      .select("id, brand_name, brand_domain, region_id, rented_by, service_postcodes")
      .is("deleted_at", null)
      .eq("status", "rented")
      .not("rented_by", "is", null);

    const assetId: string | null = (body.asset_id || "").toString().trim() || null;
    if (assetId) q = q.eq("id", assetId);

    const domain = body.brand_domain
      ? String(body.brand_domain).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      : null;
    if (!assetId && domain) q = q.ilike("brand_domain", domain);

    const nicheSlug = (body.niche || body.lead_type || "").toString().trim().toLowerCase() || null;
    if (!assetId && nicheSlug) {
      const { data: n } = await supabase.from("niches").select("id").eq("slug", nicheSlug).maybeSingle();
      if (n?.id) q = q.eq("niche_id", n.id);
    }

    const { data: candData } = await q;
    const candidates = (candData || []) as AssetRow[];

    // No live inventory to match → store nothing, but let the funnel show success.
    if (!candidates.length) return json({ success: true, status: "no_match", stored: false });

    // ── effective service area per candidate (asset override else region) ────
    const regionIds = [...new Set(candidates.map((c) => c.region_id).filter(Boolean))] as string[];
    const regionPc: Record<string, string[]> = {};
    if (regionIds.length) {
      const { data: regions } = await supabase.from("regions").select("id, postcodes").in("id", regionIds);
      for (const r of regions || []) regionPc[r.id as string] = (r.postcodes as string[] | null) || [];
    }
    const served = (a: AssetRow): boolean => {
      const patch = (a.service_postcodes && a.service_postcodes.length)
        ? a.service_postcodes
        : (a.region_id ? regionPc[a.region_id] || [] : []);
      return patch.includes(postcode); // empty patch = no coverage (never match-all)
    };
    const postcodeFiltered = candidates.filter(served);

    // ── renter business names (the consent target for each candidate) ────────
    const installerIds = [...new Set(candidates.map((c) => c.rented_by).filter(Boolean))] as string[];
    const renterName: Record<string, string> = {};
    if (installerIds.length) {
      const { data: insts } = await supabase.from("installers").select("id, business_name").in("id", installerIds);
      for (const i of insts || []) renterName[i.id as string] = (i.business_name as string) || "";
    }

    // ── consent-bound routing ────────────────────────────────────────────────
    // If the consent names a business we can deliver to, the lead MUST go to that
    // business, and only if it also serves this postcode. Consent that names
    // nobody we know → no match (never guess). No consent at all → deliver only
    // when the postcode uniquely identifies one live asset.
    const consent = getConsentText(body);
    let matched: AssetRow | null = null;

    if (consent) {
      const scored = candidates
        .map((c) => ({ c, len: longestNameInConsent([renterName[c.rented_by as string], c.brand_name], consent).length }))
        .filter((s) => s.len > 0)
        .sort((a, b) => b.len - a.len);
      if (scored.length) {
        const topLen = scored[0].len;
        const top = scored.filter((s) => s.len === topLen).map((s) => s.c);
        const postcodeTop = top.filter(served);
        if (postcodeTop.length === 1) matched = postcodeTop[0];
        // 0 → named business doesn't serve this postcode; >1 → ambiguous. Both → no match.
      }
    } else if (postcodeFiltered.length === 1) {
      matched = postcodeFiltered[0];
    }

    if (!matched) {
      const reason = postcodeFiltered.length === 0 ? "out_of_area" : "unmatched_consent";
      return json({ success: true, status: reason, stored: false });
    }

    // ── capture via insert_lead() — attribution + 30-day dedup live in the RPC ─
    const { data: lead, error } = await supabase.rpc("insert_lead", {
      p_asset_id: matched.id,
      p_full_name: name,
      p_phone: phone,
      p_email: email,
      p_postcode: postcode,
      p_extra: extra,
    });

    if (error) {
      const msg = error.message || "insert_failed";
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
      asset_id: matched.id,
      status: lead?.is_duplicate ? "duplicate" : "delivered",
      installer_id: lead?.installer_id ?? null,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal_error" }, 500);
  }
});
