import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Normalise an Australian phone number to E.164 (+61…). Stored on the lead in
// this format so twilio-inbound-sms can match replies back to the same lead -
// Twilio always reports From in E.164.
function toE164AU(p: string): string {
  const cleaned = p.replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("61")) return "+" + cleaned;
  if (cleaned.startsWith("0")) return "+61" + cleaned.slice(1);
  return "+" + cleaned;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Mirror an agency (super-admin company) SMS into ql-mc Sales Conversations.
// Fire-and-forget - only ever called for the super-admin company.
async function mirrorToQlMc(payload: {
  lead_name: string | null;
  company: string | null;
  phone: string | null;
  twilio_number: string | null;
  inbound_message: string | null;
  inbound_sid: string | null;
  outbound_message: string | null;
}): Promise<void> {
  const url = Deno.env.get("QL_MC_API_URL");
  const secret = Deno.env.get("QL_MC_API_SECRET");
  if (!url || !secret) {
    console.warn("QL_MC_API_URL or QL_MC_API_SECRET not set - skipping sales conversation mirror");
    return;
  }
  try {
    const res = await fetch(`${url}/sync-sales-conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-secret": secret },
      body: JSON.stringify({ action: "mirror_conversation", source: "Agency SMS", ...payload }),
    });
    if (!res.ok) {
      console.error(`sync-sales-conversation returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  } catch (err) {
    console.error("mirrorToQlMc failed:", err instanceof Error ? err.message : err);
  }
}

// Deliver an event to a company's active webhook_endpoints (Settings > Webhooks
// in ql-hq), signed with HMAC-SHA256 - same contract the public API uses. Fully
// self-contained: every failure is caught here, so it can never break the
// caller. Awaits all deliveries so waitUntil keeps them alive past the response.
async function fireWebhooks(
  db: ReturnType<typeof createClient>,
  companyId: string,
  event: string,
  payload: unknown,
): Promise<void> {
  try {
    const { data: endpoints } = await db
      .from("webhook_endpoints")
      .select("id, url, secret, events")
      .eq("company_id", companyId)
      .eq("active", true);

    if (!endpoints || endpoints.length === 0) return;

    const jobs: Promise<unknown>[] = [];
    for (const ep of endpoints) {
      const events = Array.isArray(ep.events) ? ep.events : [];
      if (!events.includes(event)) continue;

      const bodyObj = { event, timestamp: new Date().toISOString(), data: payload };
      const body = JSON.stringify(bodyObj);

      // Sign only when a secret is configured; a secret-less endpoint still
      // receives the lead, just without the X-Webhook-Signature header.
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

      jobs.push((async () => {
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
      })());
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("fireWebhooks error:", err);
  }
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

    const {
      company_id,
      name,
      first_name,
      last_name,
      email,
      phone,
      postcode,
      source,
      niche,
      ownership_type,
      bill_range,
      purchase_timeline,
      matched_buyer,
      consent_text,
      company: companyName,
      ...rest
    } = body as Record<string, unknown>;

    if (!company_id || typeof company_id !== "string") {
      return json({ success: false, error: "company_id is required" }, 400);
    }

    const resolvedName: string | null =
      typeof name === "string" && name.trim()
        ? name.trim()
        : typeof first_name === "string" && first_name.trim()
        ? `${first_name.trim()}${
            typeof last_name === "string" && last_name.trim()
              ? " " + last_name.trim()
              : ""
          }`
        : null;

    if (!resolvedName) {
      return json(
        { success: false, error: "name or first_name is required" },
        400,
      );
    }

    const resolvedPhone =
      typeof phone === "string" && phone.trim()
        ? toE164AU(phone.trim())
        : null;
    const resolvedEmail =
      typeof email === "string" && email.trim()
        ? email.trim().toLowerCase()
        : null;

    if (!resolvedPhone && !resolvedEmail) {
      return json(
        { success: false, error: "phone or email is required" },
        400,
      );
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: company, error: companyErr } = await db
      .from("companies")
      .select("id")
      .eq("id", company_id)
      .single();

    if (companyErr || !company) {
      return json({ success: false, error: "Company not found" }, 404);
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
      company_id,
      name: resolvedName,
      first_name: resolvedFirstName,
      last_name: resolvedLastName,
      email: resolvedEmail,
      phone: resolvedPhone,
      company:
        typeof companyName === "string" && companyName.trim() ? companyName.trim() : null,
      postcode:
        typeof postcode === "string" && postcode.trim()
          ? postcode.trim()
          : null,
      pipeline_stage: "new_lead",
      source:
        typeof source === "string" && source.trim()
          ? source.trim()
          : "Landing Page",
      ai_enabled: true,
      created_at: new Date().toISOString(),
    };

    const customFieldsData: Record<string, unknown> = {};
    if (niche !== undefined) customFieldsData.niche = niche;
    if (ownership_type !== undefined)
      customFieldsData.ownership_type = ownership_type;
    if (bill_range !== undefined) customFieldsData.bill_range = bill_range;
    if (purchase_timeline !== undefined)
      customFieldsData.purchase_timeline = purchase_timeline;
    if (matched_buyer !== undefined)
      customFieldsData.matched_buyer = matched_buyer;
    if (consent_text !== undefined)
      customFieldsData.consent_text = consent_text;
    Object.assign(customFieldsData, rest);

    if (Object.keys(customFieldsData).length > 0) {
      leadInsert.custom_fields = customFieldsData;
    }

    let { data: lead, error: leadErr } = await db
      .from("leads")
      .insert(leadInsert)
      .select("*")
      .single();

    if (leadErr) {
      if (
        leadErr.message?.includes("custom_fields") ||
        leadErr.code === "42703"
      ) {
        delete leadInsert.custom_fields;
        const retry = await db
          .from("leads")
          .insert(leadInsert)
          .select("*")
          .single();
        lead = retry.data;
        if (retry.error) {
          console.error("Lead insert error (retry):", retry.error);
          return json({ success: false, error: "Failed to create lead" }, 500);
        }
      } else {
        console.error("Lead insert error:", leadErr);
        return json({ success: false, error: "Failed to create lead" }, 500);
      }
    }

    if (!lead) {
      return json({ success: false, error: "Failed to create lead" }, 500);
    }

    const leadId = lead.id as string;

    // Deliver to the customer's signed webhook endpoints (Settings > Webhooks in
    // ql-hq) for anyone subscribed to lead.created. Fire-and-forget: fully
    // isolated in its own try/catch inside the helper, so a webhook failure can
    // never affect the lead insert or the response. No-op when the company has
    // no active endpoint subscribed to this event.
    const webhookPromise = fireWebhooks(db, company_id, "lead.created", lead);

    // Keep the welcome SMS alive past the response: waitUntil lets the edge
    // runtime finish the send after we return; without it the isolate can be
    // torn down mid-flight, so fall back to awaiting inline.
    const welcomePromise = maybeSendWelcomeSms(
      db,
      company_id,
      leadId,
      resolvedFirstName,
      resolvedPhone,
      resolvedName,
      typeof companyName === "string" ? companyName : null,
    );
    const runtime = (globalThis as Record<string, unknown>).EdgeRuntime as
      | { waitUntil?: (p: Promise<unknown>) => void }
      | undefined;
    if (runtime?.waitUntil) {
      runtime.waitUntil(welcomePromise);
      runtime.waitUntil(webhookPromise);
    } else {
      await welcomePromise;
      await webhookPromise;
    }

    return json({ success: true, lead_id: leadId });
  } catch (err) {
    console.error("intake-lead error:", err);
    return json({ success: false, error: "Internal server error" }, 500);
  }
});

async function maybeSendWelcomeSms(
  db: ReturnType<typeof createClient>,
  companyId: string,
  leadId: string,
  firstName: string,
  phone: string | null,
  fullName: string | null,
  companyName: string | null,
): Promise<void> {
  if (!phone) return;

  try {
    // Note: ai_enabled lives on leads, not sms_agent_config - selecting it
    // here used to 400 the whole query and silently kill every welcome SMS.
    const { data: smsConfig, error: cfgErr } = await db
      .from("sms_agent_config")
      .select("auto_send_welcome, welcome_message, twilio_number")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (cfgErr) {
      console.warn("Welcome SMS config lookup failed:", cfgErr.message);
      return;
    }
    if (!smsConfig) return;
    if (!smsConfig.auto_send_welcome) return;
    if (!smsConfig.twilio_number) return;

    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuth = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!twilioSid || !twilioAuth) {
      console.warn("Twilio credentials not configured - skipping welcome SMS");
      return;
    }

    const { data: creditOk } = await db.rpc("deduct_sms_credit", {
      p_company_id: companyId,
    });
    if (!creditOk) {
      console.warn("No SMS credits for company:", companyId);
      return;
    }

    const template =
      typeof smsConfig.welcome_message === "string" &&
      smsConfig.welcome_message.trim()
        ? smsConfig.welcome_message
        : "Hi {{first_name}}, thanks for reaching out!";

    const messageBody = template.replace(/\{\{first_name\}\}/gi, firstName);

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const twilioRes = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: toE164AU(phone),
        From: smsConfig.twilio_number,
        Body: messageBody,
      }).toString(),
    });

    if (!twilioRes.ok) {
      const errText = await twilioRes.text().catch(() => "");

      await db
        .rpc("refund_sms_credit", { p_company_id: companyId })
        .catch((e: unknown) =>
          console.warn(
            "Failed to refund SMS credit:",
            (e as Error).message,
          ),
        );

      console.warn(
        "Welcome SMS Twilio error:",
        twilioRes.status,
        errText,
      );
      return;
    }

    // Mirror the first outbound (welcome) message into ql-mc Sales
    // Conversations - super-admin company only. Fire-and-forget.
    try {
      const { data: superAdmin } = await db
        .from("profiles")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_admin", true)
        .limit(1)
        .maybeSingle();
      if (superAdmin) {
        await mirrorToQlMc({
          lead_name: fullName || firstName || null,
          company: companyName,
          phone: toE164AU(phone),
          twilio_number: (smsConfig.twilio_number as string) || null,
          inbound_message: null,
          inbound_sid: null,
          outbound_message: messageBody,
        });
      }
    } catch (e) {
      console.error("welcome-SMS mirror failed:", e instanceof Error ? e.message : e);
    }

    // Reuse the lead's open SMS conversation if one exists (e.g. they texted
    // first) so the welcome message lands in the same thread the inbound
    // handler uses, instead of forking a duplicate conversation.
    const { data: existingConv } = await db
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .eq("channel", "sms")
      .eq("is_open", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let conversationId: string | null = (existingConv?.id as string) || null;
    if (!conversationId) {
      const { data: conv, error: convErr } = await db
        .from("conversations")
        .insert({
          company_id: companyId,
          lead_id: leadId,
          channel: "sms",
          is_open: true,
          last_message: messageBody,
          last_message_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (convErr) {
        console.warn("Welcome SMS conversation insert failed:", convErr.message);
        return;
      }
      conversationId = (conv?.id as string) || null;
    }

    if (conversationId) {
      const { error: msgErr } = await db.from("messages").insert({
        conversation_id: conversationId,
        direction: "outbound",
        body: messageBody,
        channel: "sms",
        is_ai_generated: true,
        agent_type: "ai",
        metadata: { welcome: true },
      });
      if (msgErr) {
        console.warn("Welcome SMS message insert failed:", msgErr.message);
      }

      await db
        .from("conversations")
        .update({
          last_message: messageBody,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }
  } catch (err) {
    console.warn("maybeSendWelcomeSms error:", err);
  }
}
