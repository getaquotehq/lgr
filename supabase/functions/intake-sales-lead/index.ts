// ============================================================================
// intake-sales-lead — receives LGR's own B2B leads (e.g. Facebook lead ads for
// installers wanting to rent LGR assets) and drops them into the Sales
// Pipeline panel in mc/app.html.
//
// Distinct from intake-lead: that one is the tenant-facing CRM intake (fires
// welcome SMS / AI agent for a paying company's own end-customer leads).
// This one always lands under LGR's own internal company and never touches
// SMS/AI — it's just a raw inbound sales lead for a human to work.
//
// Request:  POST, header "x-api-secret: <SALES_LEAD_INTAKE_SECRET>"
//           body { name | first_name/last_name, email?, phone?, company?,
//                  postcode?, source?, ...extra }
// Secrets:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//           SALES_LEAD_INTAKE_SECRET
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// LGR's own house company — profile with is_admin=true lives here, so this
// is what the Sales Pipeline panel in mc/app.html reads.
const LGR_INTERNAL_COMPANY_ID = "257a6ce5-e8b8-4086-8f7d-761e9d23826d";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toE164AU(p: string): string | null {
  const cleaned = p.replace(/[\s\-().]/g, "");
  let normalised = cleaned;
  if (!normalised.startsWith("+")) {
    if (normalised.startsWith("61")) normalised = "+" + normalised;
    else if (normalised.startsWith("0")) normalised = "+61" + normalised.slice(1);
    else normalised = "+" + normalised;
  }
  return /^\+61[2-9][0-9]{8}$/.test(normalised) ? normalised : normalised || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("SALES_LEAD_INTAKE_SECRET");
  const providedSecret = req.headers.get("x-api-secret");
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const {
      name,
      first_name,
      last_name,
      email,
      phone,
      postcode,
      source,
      company: companyName,
      ...rest
    } = body as Record<string, unknown>;

    const resolvedName: string | null =
      typeof name === "string" && name.trim()
        ? name.trim()
        : typeof first_name === "string" && first_name.trim()
        ? `${first_name.trim()}${
            typeof last_name === "string" && last_name.trim() ? " " + last_name.trim() : ""
          }`
        : null;

    if (!resolvedName) {
      return json({ success: false, error: "name or first_name is required" }, 400);
    }

    const resolvedPhone =
      typeof phone === "string" && phone.trim() ? toE164AU(phone.trim()) : null;
    const resolvedEmail =
      typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;

    if (!resolvedPhone && !resolvedEmail) {
      return json({ success: false, error: "phone or email is required" }, 400);
    }

    const resolvedFirstName =
      typeof first_name === "string" && first_name.trim()
        ? first_name.trim()
        : resolvedName.split(" ")[0];
    const resolvedLastName =
      typeof last_name === "string" && last_name.trim()
        ? last_name.trim()
        : resolvedName.includes(" ")
        ? resolvedName.slice(resolvedName.indexOf(" ") + 1)
        : null;

    const leadInsert: Record<string, unknown> = {
      company_id: LGR_INTERNAL_COMPANY_ID,
      name: resolvedName,
      first_name: resolvedFirstName,
      last_name: resolvedLastName,
      email: resolvedEmail,
      phone: resolvedPhone,
      company: typeof companyName === "string" && companyName.trim() ? companyName.trim() : null,
      postcode: typeof postcode === "string" && postcode.trim() ? postcode.trim() : null,
      source: typeof source === "string" && source.trim() ? source.trim() : "Facebook Lead Ad",
      pipeline_stage: "new_lead",
      ai_enabled: false, // BD prospects — never fed to the tenant AI/SMS agent
    };

    if (Object.keys(rest).length > 0) {
      leadInsert.custom_data = rest;
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadErr } = await db
      .from("leads")
      .insert(leadInsert)
      .select("id")
      .single();

    if (leadErr || !lead) {
      console.error("Sales lead insert error:", leadErr);
      return json({ success: false, error: "Failed to create lead" }, 500);
    }

    return json({ success: true, lead_id: lead.id });
  } catch (err) {
    console.error("intake-sales-lead error:", err);
    return json({ success: false, error: "Internal server error" }, 500);
  }
});
