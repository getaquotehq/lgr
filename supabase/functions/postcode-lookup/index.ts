// ============================================================================
// postcode-lookup — "is there a live installer for this postcode?" for the LGR
// landing-page survey. Mirrors ql-mc's postcode-lookup, but resolves against
// LGR assets instead of clients.
//
// GET/POST { postcode, niche? | lead_type?, brand_domain? }
//   → { buyer_name, brand, asset_id }   when a rented asset serves the postcode
//   → { buyer_name: null, message }     when nothing covers it
//
// buyer_name is the RENTER's business_name — the business the lead will be
// delivered to and therefore the business the consent sentence must name. The
// survey drops it into the consent text so submit-lead's company-name gate
// matches at capture time.
//
// Same postcode semantics as submit-lead: a candidate serves a postcode only if
// it is in the asset's service_postcodes (else its region's postcodes). An empty
// patch is NOT match-all.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected).
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    // Accept params from the query string (GET) or a JSON body (POST).
    const url = new URL(req.url);
    let postcode = url.searchParams.get("postcode") || "";
    let niche = url.searchParams.get("niche") || url.searchParams.get("lead_type") || "";
    let brandDomain = url.searchParams.get("brand_domain") || "";
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      postcode = (b.postcode ?? postcode).toString();
      niche = (b.niche ?? b.lead_type ?? niche).toString();
      brandDomain = (b.brand_domain ?? brandDomain).toString();
    }

    postcode = postcode.replace(/\s/g, "");
    if (!/^\d{4}$/.test(postcode)) return json({ error: "A valid 4-digit postcode is required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let q = supabase
      .from("assets")
      .select("id, brand_name, brand_domain, region_id, rented_by, service_postcodes")
      .is("deleted_at", null)
      .eq("status", "rented")
      .not("rented_by", "is", null);

    const domain = brandDomain
      ? brandDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
      : null;
    if (domain) q = q.ilike("brand_domain", domain);

    const nicheSlug = niche.trim().toLowerCase();
    if (nicheSlug) {
      const { data: n } = await supabase.from("niches").select("id").eq("slug", nicheSlug).maybeSingle();
      if (n?.id) q = q.eq("niche_id", n.id);
    }

    const { data: candidates } = await q;
    const rows = candidates || [];
    if (!rows.length) return json({ buyer_name: null, message: "No installer found for this postcode" });

    // Effective service area = asset override else region default.
    const regionIds = [...new Set(rows.map((c) => c.region_id).filter(Boolean))] as string[];
    const regionPc: Record<string, string[]> = {};
    if (regionIds.length) {
      const { data: regions } = await supabase.from("regions").select("id, postcodes").in("id", regionIds);
      for (const r of regions || []) regionPc[r.id as string] = (r.postcodes as string[] | null) || [];
    }
    const match = rows.find((a) => {
      const patch = (a.service_postcodes && (a.service_postcodes as string[]).length)
        ? (a.service_postcodes as string[])
        : (a.region_id ? regionPc[a.region_id as string] || [] : []);
      return patch.includes(postcode);
    });

    if (!match) return json({ buyer_name: null, message: "No installer found for this postcode" });

    const { data: inst } = await supabase
      .from("installers").select("business_name").eq("id", match.rented_by as string).maybeSingle();

    return json({
      buyer_name: (inst?.business_name as string) || (match.brand_name as string),
      brand: match.brand_name,
      asset_id: match.id,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
