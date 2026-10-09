// =============================================================================
// admin-api - back office actions for /dashboard/admin.html
// =============================================================================
// Caller must have profiles.is_admin = true, checked server-side via the
// service role (never trusting the client).
//
//   • billing_*, *_invoice, *_bank_details → invoicing & billing panel
//   • *_dfy, *_preview_link(s), add_preview_image → per-client DFY profile
//   • *_email_template(s) → email templates panel
// =============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

// Build a map of user_id → email from auth.users (paginated).
async function emailMap(adminClient: ReturnType<typeof createClient>, ids: string[]) {
  const map: Record<string, string> = {};
  if (!ids.length) return map;
  const want = new Set(ids);
  let page = 1;
  while (want.size > 0) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (want.has(u.id)) { map[u.id] = u.email ?? ""; want.delete(u.id); }
    }
    if (data.users.length < 1000) break;
    page++;
  }
  return map;
}

// Whitelist + coerce an invoice payload coming from the client. `isPatch`
// omits absent keys (so an update only touches what was sent); a full create
// still only writes recognised columns.
function sanitizeInvoice(src: Record<string, unknown>, isPatch = false): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const textFields = [
    "company_id", "invoice_number", "client_name", "client_email", "offer_type",
    "vertical", "gst_type", "payment_details", "notes", "status", "invoice_date",
    "due_date", "delivery_period_start", "delivery_period_end",
  ];
  const numFields = ["subtotal", "gst_amount", "total"];
  for (const k of textFields) {
    if (k in src) out[k] = src[k] === "" ? null : src[k];
  }
  for (const k of numFields) {
    if (k in src) { const n = Number(src[k]); out[k] = Number.isFinite(n) ? n : 0; }
  }
  if ("line_items" in src) out.line_items = Array.isArray(src.line_items) ? src.line_items : [];
  if (!isPatch) {
    if (out.status == null) out.status = "draft";
    if (out.line_items == null) out.line_items = [];
  }
  // status guard
  if ("status" in out && out.status != null && !["draft", "sent", "paid", "unpaid"].includes(out.status as string)) {
    out.status = "draft";
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

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

    const caller = await resolveCallerUser(authHeader, userClient);
    if (!caller) return json({ error: "Not authenticated" }, 401);

    // Resolve caller flags via service role (never trust a client-supplied value).
    const { data: me, error: meErr } = await adminClient
      .from("profiles")
      .select("is_admin")
      .eq("id", caller.id)
      .maybeSingle();
    if (meErr) {
      console.error("caller profile lookup failed:", meErr.message);
      return json({ error: "Internal error" }, 500);
    }
    if (me?.is_admin !== true) return json({ error: "Forbidden: admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };

    // ═══════════════════════════ BILLING / INVOICING ═══════════════════════
    const isBillingAction = [
      "billing_list", "billing_update_company", "list_invoices", "create_invoice",
      "update_invoice", "delete_invoice", "get_bank_details", "set_bank_details",
    ].includes(action || "");

    if (isBillingAction) {
      // ── List all clients with their billing state + delivery + invoices ──
      if (action === "billing_list") {
        const { data: companies, error: cErr } = await adminClient
          .from("companies")
          .select("id, name, email, phone, plan, created_at, payment_method, ads_live_date, next_invoice_due, invoice_status, va_intro_done, va_intro_done_at")
          .order("created_at", { ascending: false });
        if (cErr) return json({ error: cErr.message }, 500);
        const ids = (companies || []).map((c: { id: string }) => c.id);
        const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

        const { data: orders } = await adminClient
          .from("area_orders").select("company_id, total_leads, delivered_leads, status").in("company_id", safeIds);
        const { data: invs } = await adminClient
          .from("invoices")
          .select("id, company_id, invoice_number, status, total, invoice_date, due_date, created_at")
          .in("company_id", safeIds).order("created_at", { ascending: false });

        const agg: Record<string, { delivered: number; total: number; activeOrders: number }> = {};
        for (const id of ids) agg[id] = { delivered: 0, total: 0, activeOrders: 0 };
        for (const o of orders || []) {
          const a = agg[o.company_id as string]; if (!a) continue;
          a.total += (o.total_leads as number) || 0;
          a.delivered += (o.delivered_leads as number) || 0;
          if (o.status === "active") a.activeOrders += 1;
        }
        const invByCo: Record<string, unknown[]> = {};
        for (const inv of invs || []) (invByCo[inv.company_id as string] ||= []).push(inv);

        const clients = (companies || []).map((c: Record<string, unknown>) => ({
          ...c,
          delivery: agg[c.id as string] || { delivered: 0, total: 0, activeOrders: 0 },
          invoices: invByCo[c.id as string] || [],
        }));
        return json({ clients });
      }

      // ── Update a company's billing / onboarding fields ──────
      if (action === "billing_update_company") {
        const { company_id, fields } = body as { company_id?: string; fields?: Record<string, unknown> };
        if (!company_id) return json({ error: "company_id is required" }, 400);
        const f = fields || {};
        const upd: Record<string, unknown> = {};
        const allowed = ["payment_method", "ads_live_date", "next_invoice_due", "invoice_status", "va_intro_done"];
        for (const k of allowed) if (k in f) upd[k] = f[k] === "" ? null : f[k];
        if ("payment_method" in upd && upd.payment_method != null && !["invoice", "stripe"].includes(upd.payment_method as string)) {
          return json({ error: "payment_method must be 'invoice' or 'stripe'" }, 400);
        }
        if ("invoice_status" in upd && upd.invoice_status != null && !["none", "due", "sent", "paid", "unpaid"].includes(upd.invoice_status as string)) {
          return json({ error: "invalid invoice_status" }, 400);
        }
        if ("va_intro_done" in upd) upd.va_intro_done_at = upd.va_intro_done ? new Date().toISOString() : null;
        if (!Object.keys(upd).length) return json({ error: "no updatable fields provided" }, 400);
        const { error } = await adminClient.from("companies").update(upd).eq("id", company_id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // ── List invoices (optionally for one company) ───────────────────────
      if (action === "list_invoices") {
        const companyId = (body as { company_id?: string }).company_id;
        let q = adminClient.from("invoices").select("*").order("created_at", { ascending: false });
        if (companyId) q = q.eq("company_id", companyId);
        const { data, error } = await q.limit(500);
        if (error) return json({ error: error.message }, 500);
        return json({ invoices: data || [] });
      }

      // ── Create an invoice ────────────────────────────────────────────────
      if (action === "create_invoice") {
        const inv = (body as { invoice?: Record<string, unknown> }).invoice || {};
        const row = sanitizeInvoice(inv);
        row.created_by = caller.id;
        const { data, error } = await adminClient.from("invoices").insert(row).select("*").single();
        if (error) return json({ error: error.message }, 500);
        return json({ invoice: data });
      }

      // ── Update an invoice (status, fields) ───────────────────
      if (action === "update_invoice") {
        const id = (body as { id?: string }).id;
        if (!id) return json({ error: "id is required" }, 400);
        const patch = (body as { patch?: Record<string, unknown> }).patch || {};
        const row = sanitizeInvoice(patch, true);
        row.updated_at = new Date().toISOString();
        if (!Object.keys(row).length) return json({ error: "no fields to update" }, 400);
        const { data, error } = await adminClient.from("invoices").update(row).eq("id", id).select("*").single();
        if (error) return json({ error: error.message }, 500);
        return json({ invoice: data });
      }

      // ── Delete an invoice ───────────────────────────────────
      if (action === "delete_invoice") {
        const id = (body as { id?: string }).id;
        if (!id) return json({ error: "id is required" }, 400);
        const { error } = await adminClient.from("invoices").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // ── Bank / business settings ─────────────────────────────────────────
      if (action === "get_bank_details") {
        const { data } = await adminClient.from("business_settings").select("*").eq("id", 1).maybeSingle();
        return json({ settings: data || {}, can_edit: true });
      }
      if (action === "set_bank_details") {
        const s = (body as { settings?: Record<string, unknown> }).settings || {};
        const allowed = ["business_name", "abn", "bank_name", "account_name", "bsb", "account_number", "payment_details", "logo_url"];
        const upd: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
        for (const k of allowed) if (k in s) upd[k] = s[k];
        const { error } = await adminClient.from("business_settings").upsert(upd, { onConflict: "id" });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
    }

    // ═══════════════════ DFY CONTENT: profile / previews / templates ═══════
    const DFY_COMPANY_ACTIONS = new Set([
      "get_dfy", "save_dfy", "list_preview_links", "add_preview_link", "add_preview_image", "delete_preview_link",
    ]);
    const TEMPLATE_ACTIONS = new Set(["list_email_templates", "save_email_template", "delete_email_template"]);
    const isDfyAction = DFY_COMPANY_ACTIONS.has(action || "") || TEMPLATE_ACTIONS.has(action || "");

    if (isDfyAction) {
      const ensureCompany = (cid?: string): string | null => cid || null;

      // ── DFY profile (service area + onboarding + campaign prefs) ─────────
      if (action === "get_dfy") {
        const cid = ensureCompany((body as { company_id?: string }).company_id);
        if (!cid) return json({ error: "Forbidden or missing company_id" }, 403);
        const { data } = await adminClient
          .from("companies").select("id, name, plan, dfy_profile").eq("id", cid).maybeSingle();
        if (!data) return json({ error: "Client not found" }, 404);
        return json({ profile: data.dfy_profile || {}, company: { id: data.id, name: data.name, plan: data.plan } });
      }
      if (action === "save_dfy") {
        const cid = ensureCompany((body as { company_id?: string }).company_id);
        if (!cid) return json({ error: "Forbidden or missing company_id" }, 403);
        const profile = (body as { profile?: unknown }).profile;
        if (typeof profile !== "object" || profile === null || Array.isArray(profile)) {
          return json({ error: "profile must be an object" }, 400);
        }
        const { error } = await adminClient.from("companies").update({ dfy_profile: profile }).eq("id", cid);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // ── Preview links / screenshots ──────────────────────────────────────
      if (action === "list_preview_links") {
        const cid = ensureCompany((body as { company_id?: string }).company_id);
        if (!cid) return json({ error: "Forbidden or missing company_id" }, 403);
        const { data } = await adminClient
          .from("preview_links").select("*").eq("company_id", cid).order("created_at", { ascending: false });
        return json({ links: data || [] });
      }
      if (action === "add_preview_link") {
        const cid = ensureCompany((body as { company_id?: string }).company_id);
        if (!cid) return json({ error: "Forbidden or missing company_id" }, 403);
        const url = ((body as { url?: string }).url || "").trim();
        if (!url) return json({ error: "url is required" }, 400);
        if (!/^https?:\/\//i.test(url)) return json({ error: "url must start with http(s)://" }, 400);
        const kind = (body as { kind?: string }).kind === "image" ? "image" : "link";
        const label = ((body as { label?: string }).label || "").trim().slice(0, 300) || null;
        const { data, error } = await adminClient
          .from("preview_links")
          .insert({ company_id: cid, kind, url: url.slice(0, 2000), label, created_by: caller.id })
          .select("*").single();
        if (error) return json({ error: error.message }, 500);
        return json({ link: data });
      }
      // ── Upload a screenshot from the user's computer to Storage ──────────
      if (action === "add_preview_image") {
        const cid = ensureCompany((body as { company_id?: string }).company_id);
        if (!cid) return json({ error: "Forbidden or missing company_id" }, 403);
        const b = body as { data?: string; filename?: string; content_type?: string; label?: string };
        if (!b.data) return json({ error: "data (base64) is required" }, 400);
        const contentType = b.content_type || "image/png";
        if (!/^image\/(png|jpe?g|gif|webp)$/i.test(contentType)) {
          return json({ error: "Only PNG, JPG, GIF or WEBP images are allowed" }, 400);
        }
        // Decode base64 (accepts a bare base64 string or a data: URL).
        let bytes: Uint8Array;
        try {
          const raw = b.data.includes(",") ? b.data.slice(b.data.indexOf(",") + 1) : b.data;
          const bin = atob(raw);
          bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        } catch {
          return json({ error: "Invalid image data" }, 400);
        }
        if (bytes.length > 10 * 1024 * 1024) return json({ error: "Image exceeds 10 MB limit" }, 400);
        const ext = (contentType.split("/")[1] || "png").replace("jpeg", "jpg");
        const path = `${cid}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await adminClient.storage
          .from("preview-images").upload(path, bytes, { contentType, upsert: false });
        if (upErr) return json({ error: upErr.message }, 500);
        const { data: pub } = adminClient.storage.from("preview-images").getPublicUrl(path);
        const label = ((b.filename || "").trim().slice(0, 300)) || null;
        const { data, error } = await adminClient
          .from("preview_links")
          .insert({ company_id: cid, kind: "image", url: pub.publicUrl, label, created_by: caller.id })
          .select("*").single();
        if (error) return json({ error: error.message }, 500);
        return json({ link: data });
      }

      if (action === "delete_preview_link") {
        const id = (body as { id?: string }).id;
        if (!id) return json({ error: "id is required" }, 400);
        const { error } = await adminClient.from("preview_links").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }

      // ── Email templates (global) ─────────────────────────────────────────
      if (action === "list_email_templates") {
        const { data } = await adminClient
          .from("email_templates").select("*").order("name", { ascending: true });
        return json({ templates: data || [] });
      }
      if (action === "save_email_template") {
        const t = (body as { template?: Record<string, unknown> }).template || {};
        const name = String(t.name || "").trim();
        if (!name) return json({ error: "name is required" }, 400);
        const row: Record<string, unknown> = {
          name: name.slice(0, 200),
          subject: t.subject != null ? String(t.subject).slice(0, 500) : null,
          body: t.body != null ? String(t.body).slice(0, 20000) : null,
          updated_at: new Date().toISOString(),
        };
        if (t.id) {
          const { data, error } = await adminClient.from("email_templates").update(row).eq("id", t.id).select("*").single();
          if (error) return json({ error: error.message }, 500);
          return json({ template: data });
        }
        row.created_by = caller.id;
        const { data, error } = await adminClient.from("email_templates").insert(row).select("*").single();
        if (error) return json({ error: error.message }, 500);
        return json({ template: data });
      }
      if (action === "delete_email_template") {
        const id = (body as { id?: string }).id;
        if (!id) return json({ error: "id is required" }, 400);
        const { error } = await adminClient.from("email_templates").delete().eq("id", id);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("admin-api error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
