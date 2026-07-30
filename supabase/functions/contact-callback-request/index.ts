// ============================================================================
// contact-callback-request: public, no-auth endpoint behind the "Request a
// callback" form on /contact. Replaces the earlier Make.com webhook - now
// lands in the DB (leads table, LGR's internal company, same Sales Pipeline
// panel in mc/app.html as the other inbound B2B sources) and emails
// contact@leadgenrentals.com.au directly.
//
// Request: POST { name, phone, email?, business?, message? }
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//          RESEND_API_KEY, RESEND_FROM_EMAIL (for the notification email)
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// LGR's own house company - same one the Sales Pipeline panel in mc/app.html reads.
const LGR_INTERNAL_COMPANY_ID = "257a6ce5-e8b8-4086-8f7d-761e9d23826d";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function notifyContact(d: { name: string; phone: string; email: string; business: string; message: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !fromEmail) {
    console.warn("contact-callback-request: RESEND_* not configured, skipping email");
    return;
  }
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#656D76">${k}</td><td><strong>${v}</strong></td></tr>`;
  const html = `
    <h2 style="margin:0 0 14px;font-family:Arial,sans-serif">New callback request</h2>
    <table style="border-collapse:collapse;font-size:14px;font-family:Arial,sans-serif">
      ${row("Name", esc(d.name))}
      ${row("Phone", esc(d.phone) || "-")}
      ${row("Email", d.email ? `<a href="mailto:${esc(d.email)}">${esc(d.email)}</a>` : "-")}
      ${row("Business", esc(d.business) || "-")}
    </table>
    ${d.message ? `<p style="margin-top:14px;font-family:Arial,sans-serif;font-size:14px"><strong>Message:</strong><br>${esc(d.message)}</p>` : ""}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Lead Gen Rentals <${fromEmail}>`,
      to: ["contact@leadgenrentals.com.au"],
      reply_to: d.email || "contact@leadgenrentals.com.au",
      subject: `New callback request - ${d.name}`,
      html,
    }),
  });
  if (!res.ok) console.error("contact-callback-request: resend error:", res.status, (await res.text()).slice(0, 300));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ success: false, error: "Invalid JSON body" }, 400);
    }

    const { name, phone, email, business, message } = body as Record<string, unknown>;
    const resolvedName = typeof name === "string" && name.trim() ? name.trim() : null;
    const resolvedPhone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const resolvedEmail = typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    const resolvedBusiness = typeof business === "string" && business.trim() ? business.trim() : null;
    const resolvedMessage = typeof message === "string" && message.trim() ? message.trim() : null;

    if (!resolvedName) {
      return json({ success: false, error: "Name is required" }, 400);
    }
    if (!resolvedPhone && !resolvedEmail) {
      return json({ success: false, error: "Phone or email is required" }, 400);
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: leadErr } = await db.from("leads").insert({
      company_id: LGR_INTERNAL_COMPANY_ID,
      name: resolvedName,
      phone: resolvedPhone,
      email: resolvedEmail,
      company: resolvedBusiness,
      source: "Contact page - callback request",
      pipeline_stage: "new_lead",
      ai_enabled: false,
      notes: resolvedMessage,
    });

    if (leadErr) {
      console.error("contact-callback-request insert error:", leadErr);
      return json({ success: false, error: "Failed to save" }, 500);
    }

    await notifyContact({
      name: resolvedName,
      phone: resolvedPhone || "",
      email: resolvedEmail || "",
      business: resolvedBusiness || "",
      message: resolvedMessage || "",
    }).catch((e) => console.error("notifyContact failed (non-fatal):", e));

    return json({ success: true });
  } catch (err) {
    console.error("contact-callback-request error:", err);
    return json({ success: false, error: "Internal server error" }, 500);
  }
});
