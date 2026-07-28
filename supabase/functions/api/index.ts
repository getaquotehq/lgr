// =============================================================================
// Lead Gen Rentals - Public REST API Gateway
// =============================================================================
// Authenticated via Bearer token (company_api_tokens).
// Routes:
//   GET    /functions/v1/api/leads             – list leads
//   POST   /functions/v1/api/leads             – create lead
//   GET    /functions/v1/api/leads/:id          – get lead
//   PATCH  /functions/v1/api/leads/:id          – update lead
//   GET    /functions/v1/api/quotes             – list quotes
//   GET    /functions/v1/api/quotes/:id         – get quote
//   POST   /functions/v1/api/sms               – send SMS to lead
//   GET    /functions/v1/api/appointments       – list appointments
//   GET    /functions/v1/api/pipeline           – pipeline summary
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dbErr(context: string, error: { message: string }): Response {
  console.error(`${context}:`, error.message);
  return json({ error: "An internal error occurred. Please try again." }, 500);
}

// ── Rate-limiter (in-memory, per company, resets on cold start) ───────────────
const rateBuckets = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 100; // requests per window
const RATE_WINDOW = 60_000; // 1 minute

function checkRateLimit(companyId: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(companyId);
  if (!bucket || now > bucket.reset) {
    bucket = { count: 0, reset: now + RATE_WINDOW };
    rateBuckets.set(companyId, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT;
}

// ── Input validation helpers ──────────────────────────────────────────────────
const MAX_STR = 500;
const MAX_TEXT = 5000;
const VALID_PIPELINE_STAGES = [
  "new", "contacted", "qualified", "quoted",
  "closed_won", "closed_lost", "follow_up",
];

function validateLeadFields(body: Record<string, unknown>): string | null {
  const strFields: [string, number][] = [
    ["name", MAX_STR], ["first_name", MAX_STR], ["last_name", MAX_STR],
    ["email", 320], ["phone", 30], ["source", MAX_STR],
    ["service_type", MAX_STR], ["address", MAX_STR], ["postcode", 50],
  ];
  for (const [key, max] of strFields) {
    if (body[key] !== undefined && body[key] !== null) {
      if (typeof body[key] !== "string") return `${key} must be a string`;
      if ((body[key] as string).length > max) return `${key} must be at most ${max} characters`;
    }
  }
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") return "notes must be a string";
    if ((body.notes as string).length > MAX_TEXT) return `notes must be at most ${MAX_TEXT} characters`;
  }
  if (body.value !== undefined && body.value !== null) {
    if (typeof body.value !== "number" || !isFinite(body.value as number))
      return "value must be a finite number";
  }
  if (body.pipeline_stage !== undefined && body.pipeline_stage !== null) {
    if (!VALID_PIPELINE_STAGES.includes(body.pipeline_stage as string))
      return `pipeline_stage must be one of: ${VALID_PIPELINE_STAGES.join(", ")}`;
  }
  if (body.assigned_to !== undefined && body.assigned_to !== null) {
    if (typeof body.assigned_to !== "string") return "assigned_to must be a string";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.assigned_to as string))
      return "assigned_to must be a valid UUID";
  }
  return null;
}

// ── Authenticate via Bearer token → company_api_tokens ────────────────────────
async function authenticateToken(
  authHeader: string | null,
  db: ReturnType<typeof createClient>,
): Promise<{ companyId: string; scopes: string[] } | Response> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(
      { error: "Missing or invalid Authorization header. Use: Bearer <api_token>" },
      401,
    );
  }

  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    return json({ error: "Empty bearer token" }, 401);
  }

  // SHA-256 hash the token
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const { data: tokenRow, error } = await db
    .from("company_api_tokens")
    .select("id, company_id, scopes, expires_at, revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !tokenRow) {
    return json({ error: "Invalid API token" }, 401);
  }

  if (tokenRow.revoked_at) {
    return json({ error: "API token has been revoked" }, 401);
  }

  if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
    return json({ error: "API token has expired" }, 401);
  }

  // Update last_used_at (fire-and-forget)
  db.from("company_api_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", tokenRow.id)
    .then(() => {});

  return {
    companyId: tokenRow.company_id,
    scopes: Array.isArray(tokenRow.scopes) ? tokenRow.scopes : [],
  };
}

function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required);
}

// ── Pagination helpers ────────────────────────────────────────────────────────
function parsePagination(url: URL): { page: number; perPage: number } {
  const rawPage = parseInt(url.searchParams.get("page") || "1", 10);
  const rawPerPage = parseInt(url.searchParams.get("per_page") || "25", 10);
  const page = Math.max(1, Number.isFinite(rawPage) ? rawPage : 1);
  const perPage = Math.min(100, Math.max(1, Number.isFinite(rawPerPage) ? rawPerPage : 25));
  return { page, perPage };
}

// ── Route parsing ─────────────────────────────────────────────────────────────
function parseRoute(url: URL): { resource: string; id?: string } {
  // Path will be like /functions/v1/api/leads or /functions/v1/api/leads/<uuid>
  // or in local dev /api/leads or /api/leads/<uuid>
  const path = url.pathname;
  const segments = path.split("/").filter(Boolean);

  // Find "api" in the segments and take what follows
  const apiIdx = segments.indexOf("api");
  if (apiIdx === -1) return { resource: "" };

  const resource = segments[apiIdx + 1] || "";
  const id = segments[apiIdx + 2] || undefined;
  return { resource, id };
}

// ── Route handlers ────────────────────────────────────────────────────────────

async function handleListLeads(
  db: ReturnType<typeof createClient>,
  companyId: string,
  url: URL,
) {
  const { page, perPage } = parsePagination(url);
  const offset = (page - 1) * perPage;

  // Optional filters
  const stage = url.searchParams.get("stage");
  const aiStatus = url.searchParams.get("ai_status");
  const search = url.searchParams.get("search");

  let query = db
    .from("leads")
    .select("*", { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (stage) query = query.eq("pipeline_stage", stage);
  if (aiStatus) query = query.eq("ai_status", aiStatus);
  if (search) {
    // Strip characters that are special in PostgREST filter strings to prevent
    // filter injection via the .or() clause (parentheses, commas, dots, colons).
    // LIKE wildcards are also escaped. Length-limited to 100 chars.
    const sanitized = search.trim().slice(0, 100).replace(/[(),.:]/g, "");
    if (sanitized) {
      const safe = sanitized.replace(/[%_\\]/g, (c) => "\\" + c);
      query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) return dbErr("db query", error);

  return json({
    data,
    meta: { page, per_page: perPage, total: count || 0 },
  });
}

async function handleGetLead(
  db: ReturnType<typeof createClient>,
  companyId: string,
  id: string,
) {
  const { data, error } = await db
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) return dbErr("db query", error);
  if (!data) return json({ error: "Lead not found" }, 404);
  return json({ data });
}

async function handleCreateLead(
  db: ReturnType<typeof createClient>,
  companyId: string,
  body: Record<string, unknown>,
) {
  const allowed = [
    "name", "first_name", "last_name", "email", "phone",
    "pipeline_stage", "source", "service_type", "value", "notes",
    "custom_data", "metadata", "postcode", "address", "assigned_to",
  ];
  const row: Record<string, unknown> = { company_id: companyId };
  for (const key of allowed) {
    if (body[key] !== undefined) row[key] = body[key];
  }

  const validationError = validateLeadFields(body);
  if (validationError) return json({ error: validationError }, 400);

  if (!row.name && !row.phone) {
    return json({ error: "At least 'name' or 'phone' is required" }, 400);
  }

  if (!row.assigned_to) {
    const { data: routedRep } = await db.rpc("route_lead", {
      p_company_id: companyId,
      p_postcode: (row.postcode as string) || null,
    });
    if (routedRep) row.assigned_to = routedRep;
  }

  const { data, error } = await db
    .from("leads")
    .insert(row)
    .select()
    .single();

  if (error) return dbErr("db query", error);

  await fireWebhooks(db, companyId, "lead.created", data);

  if (data.phone) {
    sendWelcomeSmsIfEnabled(db, companyId, data).catch((err: unknown) =>
      console.warn("Welcome SMS failed:", (err as Error).message)
    );
  }

  return json({ data }, 201);
}

async function handleUpdateLead(
  db: ReturnType<typeof createClient>,
  companyId: string,
  id: string,
  body: Record<string, unknown>,
) {
  const allowed = [
    "name", "first_name", "last_name", "email", "phone",
    "pipeline_stage", "source", "service_type", "value", "notes",
    "address", "postcode", "assigned_to",
    "ai_enabled", "custom_data", "metadata",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: "No valid fields to update" }, 400);
  }

  // Validate field types, lengths, and enum values
  const validationError = validateLeadFields(body);
  if (validationError) return json({ error: validationError }, 400);

  // Block clearing the postcode on a delivered lead - it is billing evidence
  if ("postcode" in updates && !updates.postcode) {
    const { data: existing } = await db
      .from("leads")
      .select("is_ppl")
      .eq("id", id)
      .eq("company_id", companyId)
      .single();
    if (existing?.is_ppl) {
      return json({ error: "Postcode cannot be removed from a delivered lead" }, 422);
    }
  }

  const { data, error } = await db
    .from("leads")
    .update(updates)
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single();

  if (error) return dbErr("db query", error);
  if (!data) return json({ error: "Lead not found" }, 404);

  await fireWebhooks(db, companyId, "lead.updated", data);

  return json({ data });
}

async function handleListQuotes(
  db: ReturnType<typeof createClient>,
  companyId: string,
  url: URL,
) {
  const { page, perPage } = parsePagination(url);
  const offset = (page - 1) * perPage;

  const status = url.searchParams.get("status");

  let query = db
    .from("quotes")
    .select("id, company_id, quote_number, status, total, tax, subtotal, lead_id, created_by, valid_until, notes, line_items, metadata, created_at, updated_at, sent_at, viewed_at, accepted_at", { count: "exact" })
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .range(offset, offset + perPage - 1);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return dbErr("db query", error);

  return json({
    data,
    meta: { page, per_page: perPage, total: count || 0 },
  });
}

async function handleGetQuote(
  db: ReturnType<typeof createClient>,
  companyId: string,
  id: string,
) {
  const { data, error } = await db
    .from("quotes")
    .select("id, company_id, quote_number, status, total, tax, subtotal, line_items, lead_id, created_by, valid_until, notes, metadata, created_at, updated_at, sent_at, viewed_at, accepted_at")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) return dbErr("db query", error);
  if (!data) return json({ error: "Quote not found" }, 404);
  return json({ data });
}

async function handleSendSms(
  db: ReturnType<typeof createClient>,
  companyId: string,
  body: Record<string, unknown>,
) {
  const { lead_id, message } = body as { lead_id?: string; message?: string };
  if (!lead_id || !message) {
    return json({ error: "'lead_id' and 'message' are required" }, 400);
  }

  // Verify lead belongs to company
  const { data: lead } = await db
    .from("leads")
    .select("id, phone")
    .eq("id", lead_id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!lead) return json({ error: "Lead not found or does not belong to your company" }, 404);
  if (!lead.phone) return json({ error: "Lead has no phone number" }, 400);

  // Get company Twilio number
  const { data: smsConfig } = await db
    .from("sms_agent_config")
    .select("twilio_number")
    .eq("company_id", companyId)
    .maybeSingle();

  const fromNumber = smsConfig?.twilio_number;
  if (!fromNumber) return json({ error: "No Twilio number configured" }, 500);

  // Resolve Twilio keys from edge-function secrets
  const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!twilioSid || !twilioAuth) {
    return json({ error: "Twilio not configured" }, 500);
  }

  // Deduct SMS credit
  const { data: creditOk } = await db.rpc("deduct_sms_credit", {
    p_company_id: companyId,
  });
  if (!creditOk) return json({ error: "Insufficient SMS credits" }, 402);

  // Send via Twilio
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const twilioRes = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      From: fromNumber,
      To: lead.phone,
      Body: message,
    }).toString(),
  });

  if (!twilioRes.ok) {
    await db.rpc("refund_sms_credit", { p_company_id: companyId });
    const err = await twilioRes.text();
    console.error("Twilio send failed:", err);
    return json({ error: "Failed to send SMS" }, 500);
  }

  // Find or create conversation
  let { data: conv } = await db
    .from("conversations")
    .select("id")
    .eq("lead_id", lead.id)
    .eq("company_id", companyId)
    .eq("channel", "sms")
    .maybeSingle();

  if (!conv) {
    const { data: newConv } = await db
      .from("conversations")
      .insert({ company_id: companyId, lead_id: lead.id, channel: "sms" })
      .select("id")
      .single();
    conv = newConv;
  }

  if (conv) {
    await db.from("messages").insert({
      conversation_id: conv.id,
      direction: "outbound",
      body: message,
      is_ai_generated: false,
      agent_type: "human",
    });
  }

  return json({ success: true, message: "SMS sent" });
}

async function handleListAppointments(
  db: ReturnType<typeof createClient>,
  companyId: string,
  url: URL,
) {
  const { page, perPage } = parsePagination(url);
  const offset = (page - 1) * perPage;

  let query = db
    .from("appointments")
    .select("*, leads(name, phone, email)", { count: "exact" })
    .eq("company_id", companyId)
    .order("start_time", { ascending: false })
    .range(offset, offset + perPage - 1);

  const type = url.searchParams.get("type");
  if (type) query = query.eq("appointment_type", type);

  const { data, error, count } = await query;
  if (error) return dbErr("db query", error);

  return json({
    data,
    meta: { page, per_page: perPage, total: count || 0 },
  });
}

async function handlePipeline(
  db: ReturnType<typeof createClient>,
  companyId: string,
) {
  const stages = ["new_lead", "follow_up", "quote_in_progress", "quoted", "closed_won", "closed_lost"];
  const result: Record<string, number> = {};

  for (const stage of stages) {
    const { count } = await db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("pipeline_stage", stage);
    result[stage] = count || 0;
  }

  return json({ data: result });
}

// ── Auto-send Welcome SMS ─────────────────────────────────────────────────────
// Checks company sms_agent_config for auto_send_welcome flag and sends the
// customized welcome_message to the new lead via Twilio.
async function sendWelcomeSmsIfEnabled(
  db: ReturnType<typeof createClient>,
  companyId: string,
  lead: Record<string, unknown>,
): Promise<void> {
  const { data: smsConfig } = await db
    .from("sms_agent_config")
    .select("auto_send_welcome, welcome_message, is_active, twilio_number, company_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!smsConfig?.auto_send_welcome || !smsConfig.is_active || !smsConfig.twilio_number) return;

  // Resolve {{first_name}} placeholder
  const firstName = (lead.first_name as string) ||
    ((lead.name as string) || "").split(" ")[0] || "";
  const template = (smsConfig.welcome_message as string) || "Hi {{first_name}}, thanks for reaching out!";
  const body = template.replace(/\{\{first_name\}\}/gi, firstName || "there");

  // Check SMS credits
  const { data: creditOk } = await db.rpc("deduct_sms_credit", {
    p_company_id: companyId,
  });
  if (!creditOk) {
    console.warn("No SMS credits for welcome message");
    return;
  }

  // Resolve Twilio keys from edge-function secrets
  const twilioSid: string | null = Deno.env.get("TWILIO_ACCOUNT_SID") || null;
  const twilioAuth: string | null = Deno.env.get("TWILIO_AUTH_TOKEN") || null;
  if (!twilioSid || !twilioAuth) return;

  // Send via Twilio
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
  const res = await fetch(twilioUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: lead.phone as string,
      From: smsConfig.twilio_number as string,
      Body: body,
    }).toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Welcome SMS Twilio error:", errBody);
    // Refund deducted credit
    await db.rpc("refund_sms_credit", { p_company_id: companyId }).catch(() => {});
    return;
  }

  // Get or create conversation for message storage
  const { data: existingConv } = await db
    .from("conversations")
    .select("id")
    .eq("company_id", companyId)
    .eq("lead_id", lead.id as string)
    .eq("channel", "sms")
    .eq("is_open", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let conversationId = existingConv?.id || null;
  if (!conversationId) {
    const { data: newConv } = await db
      .from("conversations")
      .insert({
        company_id: companyId,
        lead_id: lead.id,
        channel: "sms",
        is_open: true,
        last_message: body,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    conversationId = newConv?.id || null;
  }

  if (conversationId) {
    await db.from("messages").insert({
      conversation_id: conversationId,
      direction: "outbound",
      body,
      channel: "sms",
      is_ai_generated: true,
      agent_type: "ai",
      metadata: { welcome_message: true, auto_sent: true },
    });

    await db
      .from("conversations")
      .update({ last_message: body, last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
  }
}

// ── Webhook firing ────────────────────────────────────────────────────────────
async function fireWebhooks(
  db: ReturnType<typeof createClient>,
  companyId: string,
  event: string,
  payload: unknown,
) {
  try {
    const { data: endpoints } = await db
      .from("webhook_endpoints")
      .select("id, url, secret, events")
      .eq("company_id", companyId)
      .eq("active", true);

    if (!endpoints || endpoints.length === 0) return;

    for (const ep of endpoints) {
      const events = Array.isArray(ep.events) ? ep.events : [];
      if (!events.includes(event)) continue;

      const bodyObj = {
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      };
      const body = JSON.stringify(bodyObj);

      // HMAC-SHA256 signature - only when a secret is configured. A secret-less
      // endpoint still receives the event, just without the signature header.
      let signature: string | null = null;
      if (ep.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw",
          encoder.encode(ep.secret),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        );
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        signature = Array.from(new Uint8Array(sig))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }

      // Fire-and-forget delivery with logging
      (async () => {
        let success = false;
        let responseStatus = 0;
        let responseBody = "";

        try {
          const res = await fetch(ep.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Webhook-Event": event,
              ...(signature ? { "X-Webhook-Signature": signature } : {}),
            },
            body,
          });
          responseStatus = res.status;
          responseBody = (await res.text()).slice(0, 1000);
          success = res.ok;
        } catch (err) {
          responseBody = `${(err as Error).name}: ${(err as Error).message}`;
        }

        await db.from("webhook_deliveries").insert({
          webhook_id: ep.id,
          company_id: companyId,
          event,
          payload: bodyObj,
          response_status: responseStatus,
          response_body: responseBody,
          success,
        });
      })();
    }
  } catch (err) {
    console.error("fireWebhooks error:", err);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Authenticate
  const authResult = await authenticateToken(
    req.headers.get("Authorization"),
    db,
  );
  if (authResult instanceof Response) return authResult;

  const { companyId, scopes } = authResult;

  // Rate limiting
  if (!checkRateLimit(companyId)) {
    return json({ error: "Rate limit exceeded. Max 100 requests per minute." }, 429);
  }

  const url = new URL(req.url);
  const { resource, id } = parseRoute(url);
  const method = req.method;

  try {
    // ── Leads ─────────────────────────────────────────────────────────────
    if (resource === "leads") {
      if (method === "GET" && !id) {
        if (!hasScope(scopes, "leads:read")) return json({ error: "Insufficient scope: leads:read required" }, 403);
        return await handleListLeads(db, companyId, url);
      }
      if (method === "GET" && id) {
        if (!hasScope(scopes, "leads:read")) return json({ error: "Insufficient scope: leads:read required" }, 403);
        return await handleGetLead(db, companyId, id);
      }
      if (method === "POST") {
        if (!hasScope(scopes, "leads:write")) return json({ error: "Insufficient scope: leads:write required" }, 403);
        const body = await req.json();
        return await handleCreateLead(db, companyId, body);
      }
      if (method === "PATCH" && id) {
        if (!hasScope(scopes, "leads:write")) return json({ error: "Insufficient scope: leads:write required" }, 403);
        const body = await req.json();
        return await handleUpdateLead(db, companyId, id, body);
      }
    }

    // ── Quotes ────────────────────────────────────────────────────────────
    if (resource === "quotes") {
      if (!hasScope(scopes, "quotes:read")) return json({ error: "Insufficient scope: quotes:read required" }, 403);
      if (method === "GET" && !id) return await handleListQuotes(db, companyId, url);
      if (method === "GET" && id) return await handleGetQuote(db, companyId, id);
    }

    // ── SMS ───────────────────────────────────────────────────────────────
    if (resource === "sms" && method === "POST") {
      if (!hasScope(scopes, "sms:send")) return json({ error: "Insufficient scope: sms:send required" }, 403);
      const body = await req.json();
      return await handleSendSms(db, companyId, body);
    }

    // ── Appointments ──────────────────────────────────────────────────────
    if (resource === "appointments" && method === "GET") {
      if (!hasScope(scopes, "appointments:read")) return json({ error: "Insufficient scope: appointments:read required" }, 403);
      return await handleListAppointments(db, companyId, url);
    }

    // ── Pipeline ──────────────────────────────────────────────────────────
    if (resource === "pipeline" && method === "GET") {
      if (!hasScope(scopes, "pipeline:read")) return json({ error: "Insufficient scope: pipeline:read required" }, 403);
      return await handlePipeline(db, companyId);
    }

    return json({ error: `Unknown route: ${method} /api/${resource}${id ? "/" + id : ""}` }, 404);
  } catch (err) {
    console.error("API error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
