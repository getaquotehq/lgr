// ============================================================================
// deliver-lead — pushes a captured LGR lead to its installer.
//
// A lead is already bound to an installer at capture time
// (assets.rented_by → leads.installer_id), so this resolves the recipient from
// the lead itself — no client-matching. It delivers
// over the installer's preferred channel(s) and writes each attempt into
// lead_delivery_log, then stamps leads.delivered_at.
//
// Request:  POST { "lead_id": "<uuid>" }   (installer_id optional override)
// Secrets:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//           RESEND_API_KEY, RESEND_FROM_EMAIL,
//           TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function formatAEST(date: Date): string {
  return date.toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }) + " AEST";
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeSmsField(value: unknown): string {
  return String(value ?? "").replace(/[\x00-\x1F\x7F]/g, " ").trim();
}

// Flatten leads.extra (jsonb) into clean [label, value] pairs for delivery.
function extraPairs(extra: unknown): Array<[string, string]> {
  if (!extra || typeof extra !== "object" || Array.isArray(extra)) return [];
  const labelise = (k: string) => k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return Object.entries(extra as Record<string, unknown>)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => [labelise(k), String(v).trim()] as [string, string]);
}

function buildEmailHtml(lead: Record<string, unknown>, brand: string): string {
  const now = formatAEST(new Date());
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#666;font-size:13px;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:6px 12px;color:#111;font-weight:600;font-size:13px">${value}</td></tr>`;
  let rows = "";
  rows += row("Name", esc(lead.full_name as string));
  rows += row("Phone", `<a href="tel:${esc(lead.phone as string)}" style="color:#c47d0a">${esc(lead.phone as string)}</a>`);
  rows += row("Email", lead.email ? `<a href="mailto:${esc(lead.email as string)}" style="color:#c47d0a">${esc(lead.email as string)}</a>` : "—");
  rows += row("Postcode", esc((lead.postcode as string) || "—"));
  let details = "";
  const pairs = extraPairs(lead.extra);
  if (pairs.length) {
    details = `<tr><td colspan="2" style="padding:14px 12px 6px;font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.1em">Details</td></tr>`;
    for (const [label, value] of pairs) details += row(label, esc(value));
  }
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fff">
  <div style="padding:14px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e5e5e5">
    <span style="color:#111;font-weight:700;font-size:14px">${esc(brand)} · New Lead</span>
    <span style="color:#666;font-size:12px">${esc(now)}</span>
  </div>
  <table style="width:100%;border-collapse:collapse;background:#fff">${rows}${details}</table>
  <div style="padding:16px 12px;font-size:11px;color:#999">Delivered by Lead Gen Rentals · ${esc(lead.id as string)}</div>
</div></body></html>`;
}

function buildSmsBody(lead: Record<string, unknown>, brand: string): string {
  const lines: string[] = [`${brand}: New Lead`];
  lines.push(`Name: ${sanitizeSmsField(lead.full_name)}`);
  lines.push(`Phone: ${sanitizeSmsField(lead.phone)}`);
  if (lead.email) lines.push(`Email: ${sanitizeSmsField(lead.email)}`);
  if (lead.postcode) lines.push(`Postcode: ${sanitizeSmsField(lead.postcode)}`);
  for (const [label, value] of extraPairs(lead.extra)) lines.push(`${label}: ${sanitizeSmsField(value)}`);
  return lines.join("\n");
}

type DeliveryResult = { ok: boolean; status: number; body: string };

async function logDelivery(
  supabase: ReturnType<typeof createClient>,
  lead: Record<string, unknown>,
  installerId: string,
  channel: string,
  destination: string,
  preview: string,
  res: DeliveryResult,
) {
  await supabase.from("lead_delivery_log").insert([{
    lead_id: lead.id,
    installer_id: installerId,
    channel,
    destination,
    message_preview: preview,
    response_code: res.status,
    response_body: res.body,
    status: res.ok ? "sent" : "failed",
    delivered_at: res.ok ? new Date().toISOString() : null,
  }]);
}

async function deliverEmail(lead: Record<string, unknown>, to: string, brand: string): Promise<DeliveryResult> {
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!fromEmail || !apiKey) return { ok: false, status: 0, body: "email not configured (RESEND_* missing)" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${brand} <${fromEmail}>`,
      to: [to],
      reply_to: "contact@leadgenrentals.com.au",
      subject: `New Lead — ${lead.full_name} · ${lead.postcode ?? ""}`.trim(),
      html: buildEmailHtml(lead, brand),
    }),
  });
  return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 500) };
}

async function deliverSms(lead: Record<string, unknown>, to: string, brand: string): Promise<DeliveryResult> {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) return { ok: false, status: 0, body: "sms not configured (TWILIO_* missing)" };
  const params = new URLSearchParams({ To: to, From: from, Body: buildSmsBody(lead, brand) });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(sid + ":" + token), "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 500) };
}

async function deliverWebhook(lead: Record<string, unknown>, url: string): Promise<DeliveryResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });
    return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 500) };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { lead_id, installer_id } = await req.json();
    if (!lead_id) return jsonResponse({ error: "lead_id required" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // FETCH — lead + its asset (brand) + installer (recipient config)
    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).single();
    if (!lead) return jsonResponse({ error: "lead not found" }, 404);

    const recipientId = (installer_id as string) || (lead.installer_id as string);
    if (!recipientId) return jsonResponse({ error: "lead has no installer to deliver to" }, 400);

    const [{ data: installer }, { data: asset }] = await Promise.all([
      supabase.from("installers").select("*").eq("id", recipientId).single(),
      supabase.from("assets").select("brand_name").eq("id", lead.asset_id as string).single(),
    ]);
    if (!installer) return jsonResponse({ error: "installer not found" }, 404);

    // Only deliver leads that actually count (not duplicate/invalid).
    if (lead.status !== "delivered") {
      return jsonResponse({ error: `lead status is '${lead.status}', not delivered` }, 400);
    }

    const brand = (asset?.brand_name as string) || "Lead Gen Rentals";
    const method = (installer.delivery_method as string) || "email";
    const email = (installer.delivery_email as string) || (installer.email as string);
    const phone = (installer.delivery_phone as string) || (installer.phone as string);
    const webhook = installer.webhook_url as string | null;

    const jobs: Array<{ channel: string; dest: string; run: () => Promise<DeliveryResult>; preview: string }> = [];
    const wantEmail = method === "email" || method === "email_and_sms";
    const wantSms = method === "sms" || method === "email_and_sms";
    const wantWebhook = method === "webhook";
    if (wantEmail && email) jobs.push({ channel: "email", dest: email, run: () => deliverEmail(lead, email, brand), preview: `New Lead — ${lead.full_name}` });
    if (wantSms && phone) jobs.push({ channel: "sms", dest: phone, run: () => deliverSms(lead, phone, brand), preview: buildSmsBody(lead, brand) });
    if (wantWebhook && webhook) jobs.push({ channel: "webhook", dest: webhook, run: () => deliverWebhook(lead, webhook), preview: `POST ${webhook} — full lead JSON` });

    if (!jobs.length) {
      const detail = `no destination for delivery_method '${method}'`;
      await supabase.from("lead_delivery_log").insert([{ lead_id, installer_id: recipientId, channel: method, status: "failed", detail, response_body: detail }]);
      return jsonResponse({ success: false, lead_id, error: detail }, 400);
    }

    const results = await Promise.all(jobs.map(async (j) => {
      const res = await j.run();
      await logDelivery(supabase, lead, recipientId, j.channel, j.dest, j.preview, res);
      return { channel: j.channel, status: res.ok ? "sent" : "failed", ...(res.ok ? {} : { error: res.body }) };
    }));

    const anyOk = results.some((r) => r.status === "sent");
    const firstErr = results.find((r) => r.status === "failed")?.error || null;
    await supabase.from("leads").update({
      delivered_at: anyOk ? new Date().toISOString() : (lead.delivered_at as string) || null,
      delivery_error: anyOk ? null : firstErr,
    }).eq("id", lead_id);

    return jsonResponse({ success: anyOk, lead_id, installer_id: recipientId, results });
  } catch (err) {
    return jsonResponse({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
});
