// =============================================================================
// Lead Gen Rentals - Twilio Inbound SMS Webhook
// =============================================================================
// Replaces the full Make.com workflow. Receives inbound SMS from Twilio,
// runs the AI nurturing pipeline, and replies via Twilio.
//
// Flow:
//  1. Parse Twilio webhook payload (From, To, Body)
//  2. Look up company by the Twilio number (sms_agent_config.twilio_number)
//  3. Check SMS credits are topped up
//  4. Check AI settings (auto_reply, out_of_hours_only, callback, onsite, quote drafting)
//  5. Find or create the lead by phone number
//  6. Check per-lead AI toggle
//  7. Get/create conversation + message history
//  8. Store the inbound message
//  9. Resolve API keys (agency vs external)
// 10. Build prompt with context + run OpenAI
// 11. Parse AI response for structured actions (score, callback, appointment, quote)
// 12. Update lead score
// 13. Create appointment if callback/onsite detected
// 14. Draft quote if conditions met
// 15. Deduct SMS credit + send reply via Twilio
// 16. Store outbound message
// =============================================================================

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

// ── Inline email templates (avoids local-file import that breaks deployment) ──
const _BRAND_COLOR = "#F59E0B";
const _BRAND_NAME = "Lead Gen Rentals";
function _baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f9;padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08)">
<tr><td style="background:${_BRAND_COLOR};padding:24px 32px">
  <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600">${_BRAND_NAME}</h1>
</td></tr>
<tr><td style="padding:32px">
  ${content}
</td></tr>
<tr><td style="padding:16px 32px;background:#f8f9fb;border-top:1px solid #e5e7eb">
  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center">
    &copy; ${new Date().getFullYear()} ${_BRAND_NAME}. All rights reserved.
  </p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
function callbackBookedEmail(leadName: string, scheduledTime: string, companyName: string): { subject: string; html: string } {
  return {
    subject: `Callback booked with ${leadName}`,
    html: _baseLayout(`
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827">Callback Booked</h2>
      <p style="margin:0 0 8px;font-size:14px;color:#374151">Your AI assistant has booked a callback with <strong>${leadName}</strong>.</p>
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Scheduled for:</strong> ${scheduledTime}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Company:</strong> ${companyName}</p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280">Log in to your dashboard to view details and prepare for the call.</p>
    `),
  };
}
function onsiteBookedEmail(leadName: string, scheduledTime: string, companyName: string): { subject: string; html: string } {
  return {
    subject: `On-site visit booked with ${leadName}`,
    html: _baseLayout(`
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827">On-Site Visit Booked</h2>
      <p style="margin:0 0 8px;font-size:14px;color:#374151">Your AI assistant has booked an on-site visit with <strong>${leadName}</strong>.</p>
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Scheduled for:</strong> ${scheduledTime}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Company:</strong> ${companyName}</p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280">Log in to your dashboard to view details and prepare for the visit.</p>
    `),
  };
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---------------------------------------------------------------------------
// True only for the one company tied to a profiles.is_admin=true user (the
// agency/super-admin tenant). Every other company is a no-op.
async function companyIsSuperAdmin(
  db: ReturnType<typeof createClient>,
  companyId: string,
): Promise<boolean> {
  try {
    const { data } = await db
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

// Detect a STOP/START keyword and flag the lead's opt-out by phone. Used in the
// AI-off / out-of-hours branches (where the lead isn't resolved yet) so an
// opt-out is always recorded even when the AI won't reply. Returns "stopped"
// when it was a STOP so the caller can send the confirmation.
async function flagOptOutIfKeyword(
  db: ReturnType<typeof createClient>,
  companyId: string,
  fromNumber: string,
  inboundBody: string,
): Promise<"stopped" | null> {
  try {
    const kw = inboundBody.trim().toUpperCase().replace(/[.!,?]/g, "").replace(/\s+/g, " ").trim();
    const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT-OUT", "OPT OUT"]);
    const START = new Set(["START", "UNSTOP", "RESUBSCRIBE", "OPTIN", "OPT-IN", "OPT IN"]);
    const isStop = STOP.has(kw), isStart = START.has(kw);
    if (!isStop && !isStart) return null;
    const candidates = [fromNumber, fromNumber.replace(/^\+/, "")];
    if (fromNumber.startsWith("+61")) candidates.push("0" + fromNumber.slice(3));
    const { data: ld } = await db.from("leads").select("id").eq("company_id", companyId).in("phone", candidates).limit(1).maybeSingle();
    if (ld) {
      if (isStop) await db.from("leads").update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() }).eq("id", ld.id);
      else await db.from("leads").update({ sms_opted_out: false, sms_opted_out_at: null }).eq("id", ld.id);
    }
    return isStop ? "stopped" : null;
  } catch (e) {
    console.error("flagOptOutIfKeyword failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fetch relevant company knowledge for prompt enrichment (RAG-lite)
// ---------------------------------------------------------------------------
async function fetchCompanyKnowledge(
  db: SupabaseClient,
  companyId: string,
  _context?: { action?: string; tags?: string[] },
): Promise<string> {
  try {
    // Fetch company-specific learnings
    const { data: knowledge } = await db
      .from("company_knowledge")
      .select("category, insight")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(5);

    // Fetch industry-level baseline insights (cross-company, anonymized)
    const { data: industryInsights } = await db
      .from("industry_insights")
      .select("insight")
      .eq("is_active", true)
      .gte("confidence", 0.3)
      .order("confidence", { ascending: false })
      .limit(2);

    const parts: string[] = [];

    if (knowledge && knowledge.length > 0) {
      const insights = knowledge.map((k) => `- ${k.insight}`).join("\n");
      parts.push(`Based on past successful interactions with this company's customers, keep these learnings in mind:\n${insights}`);
    }

    if (industryInsights && industryInsights.length > 0) {
      const industry = industryInsights.map((i) => `- ${i.insight}`).join("\n");
      parts.push(`Industry benchmarks:\n${industry}`);
    }

    if (parts.length === 0) return "";
    return `\n\n${parts.join("\n\n")}\nApply these insights naturally without mentioning them explicitly.`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget call to ai-learner for knowledge extraction
// ---------------------------------------------------------------------------
function triggerAILearner(
  event: string,
  companyId: string,
  leadId: string,
  metadata?: Record<string, unknown>,
): void {
  fetch(`${SUPABASE_URL}/functions/v1/ai-learner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      event,
      company_id: companyId,
      lead_id: leadId,
      metadata,
    }),
  }).catch((err) => console.error("ai-learner trigger failed:", err));
}

// ── Outbound webhook helper ───────────────────────────────────────────────────
async function fireWebhooks(
  db: SupabaseClient,
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
      const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
      // Sign only when a secret is configured; a secret-less endpoint still
      // receives the event, just without the X-Webhook-Signature header.
      let signature: string | null = null;
      if (ep.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(ep.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        signature = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      (async () => {
        let success = false, responseStatus = 0, responseBody = "";
        try {
          const res = await fetch(ep.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Event": event, ...(signature ? { "X-Webhook-Signature": signature } : {}) }, body });
          responseStatus = res.status; responseBody = (await res.text()).slice(0, 1000); success = res.ok;
        } catch (err) { responseBody = `${(err as Error).name}: ${(err as Error).message}`; }
        await db.from("webhook_deliveries").insert({ webhook_id: ep.id, company_id: companyId, event, payload: JSON.parse(body), response_status: responseStatus, response_body: responseBody, success });
      })();
    }
  } catch (err) { console.error("fireWebhooks error:", err); }
}

/**
 * Send a notification email via Resend to company owners/admins.
 * Non-blocking - failures are logged but never interrupt the SMS flow.
 */
async function sendNotificationEmail(
  db: SupabaseClient,
  companyId: string,
  emailContent: { subject: string; html: string },
): Promise<void> {
  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) return; // Resend not configured - skip silently

    // Look up owners and admins for this company via auth.users join
    const { data: ownerProfiles } = await db
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .in("role", ["owner", "admin"]);

    if (!ownerProfiles || ownerProfiles.length === 0) return;

    // Fetch emails from auth.users via admin API
    const emails: string[] = [];
    for (const profile of ownerProfiles) {
      const { data: userData } = await db.auth.admin.getUserById(profile.id);
      if (userData?.user?.email) {
        emails.push(userData.user.email);
      }
    }

    if (emails.length === 0) return;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM_EMAIL") || "Lead Gen Rentals <noreply@leadgenrentals.com.au>",
        to: emails,
        subject: emailContent.subject,
        html: emailContent.html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error(`Resend notification email failed (HTTP ${resendRes.status}):`, errText);
    }
  } catch (err) {
    console.error("sendNotificationEmail failed:", err);
  }
}

// Twilio sends application/x-www-form-urlencoded
function parseTwilioBody(body: string): Record<string, string> {
  const params: Record<string, string> = {};
  const sp = new URLSearchParams(body);
  for (const [key, val] of sp.entries()) {
    params[key] = val;
  }
  return params;
}

// Normalise phone to E.164-ish for matching (strip spaces, ensure +)
function normalisePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (!cleaned.startsWith("+")) cleaned = "+" + cleaned;
  return cleaned;
}

// ---------------------------------------------------------------------------
// Key resolution: always use edge-function secrets
// ---------------------------------------------------------------------------
const ENV_FALLBACKS: Record<string, string> = {
  twilio: "TWILIO_ACCOUNT_SID",
  twilio_auth: "TWILIO_AUTH_TOKEN",
  openai: "OPEN_AI_API_KEY",
};

async function resolveKey(
  _db: SupabaseClient,
  _companyId: string,
  provider: string,
  _userType: string
): Promise<string> {
  const envName = ENV_FALLBACKS[provider];
  if (envName) {
    const envVal = Deno.env.get(envName);
    if (envVal) return envVal;
  }

  throw new Error(`Key not configured for ${provider}: set the ${ENV_FALLBACKS[provider] ?? provider.toUpperCase()} secret`);
}

// ---------------------------------------------------------------------------
// OpenAI chat completion
// ---------------------------------------------------------------------------
async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  conversationMessages: { role: string; content: string }[]
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationMessages,
      ],
      temperature: 0.4,
      max_tokens: 250, // allow room for reply + JSON metadata block
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${err}`);
  }

  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() ?? "";
}

// ---------------------------------------------------------------------------
// AI status helper: derive heat label from score
// ---------------------------------------------------------------------------
function aiStatusFromScore(score: number | null | undefined): string {
  if (score == null) return "new";
  if (score >= 75) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

// ---------------------------------------------------------------------------
// Send SMS via Twilio
// ---------------------------------------------------------------------------
async function sendTwilioSMS(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const encoded = btoa(`${accountSid}:${authToken}`);

  const formBody = new URLSearchParams({ To: to, From: from, Body: body });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encoded}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Twilio send error ${res.status}: ${err}`);
  }
}

// ---------------------------------------------------------------------------
// Build the AI system prompt with company context + settings
// ---------------------------------------------------------------------------
function buildSystemPrompt(
  config: Record<string, unknown>,
  lead: Record<string, unknown>,
  quoteStatus: string | null,
  companyKnowledge?: string,
  isSuperAdminCompany?: boolean,
): string {
  // Super-admin companies (the agency's own tenant) run entirely on their own
  // system_prompt - the baked-in trade persona/rules/goal/callback logic below
  // never applies to them. Every other company is completely unaffected: this
  // only ever matches the one company tied to a super-admin profile.
  if (isSuperAdminCompany) {
    const leadName = (lead.first_name as string) || (lead.name as string) || null;
    const leadCompany = (lead.company as string) || null;
    const contextLine = leadName || leadCompany
      ? `Lead context: ${[leadName && `name is ${leadName}`, leadCompany && `company is ${leadCompany}`].filter(Boolean).join(", ")}.\n\n`
      : "";

    // Data only (no persona/rules) - the model otherwise has no way to know
    // the current date/time, which the custom prompt relies on for booking.
    const nowSA = new Date();
    const todayStrSA = nowSA.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStrSA = nowSA.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });
    const dateTimeLine = `Today: ${todayStrSA}. Current time: ${timeStrSA}.\n\n`;

    // Lightweight JSON action tag - same mechanism the normal pipeline uses to
    // detect a confirmed callback and auto-create the appointment. Kept to
    // just callback/none since onsite + quote drafting don't apply here.
    const jsonDirective = `\n\nIMPORTANT: After your reply text, output a JSON block on a new line starting with "---JSON---":
---JSON---
{"score": <0-100>, "score_reason": "<brief reason>", "action": "<callback|none>", "appointment_time": "<ISO8601 datetime or null>", "appointment_note": "<brief note or null>"}

Score: 0-20 cold, 21-40 mild interest, 41-60 engaged, 61-80 ready, 81-100 call booked.
Action: "callback" only once a specific call time has been confirmed with the lead, with appointment_time set (full ISO8601 with timezone, e.g. "2026-04-02T14:00:00+10:00"). Otherwise "none".`;

    return contextLine + dateTimeLine + ((config.system_prompt as string) || "").trim() + jsonDirective;
  }

  const companyName = (config.company_name as string) || "our company";
  const area = (config.company_area as string) || "your area";
  const service = (config.service_description as string) || "our services";
  const leadFirstName = (lead.first_name as string) || null;
  const callbackEnabled = config.callback_enabled as boolean;
  const onsiteEnabled = config.onsite_enabled as boolean;
  const quoteDrafting = config.quote_drafting_enabled as boolean;
  const rawDays = config.callback_days;
  const callbackDays: string[] = Array.isArray(rawDays) ? rawDays : ["tue", "wed", "fri", "sat"];
  const callbackStart = (config.callback_hours_start as string) || "09:00";
  const callbackEnd = (config.callback_hours_end as string) || "17:00";

  const dayNames: Record<string, string> = {
    mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
    fri: "Friday", sat: "Saturday", sun: "Sunday",
  };
  const callbackDaysList = callbackDays.map((d: string) => dayNames[d] || d).join(", ");

  // ── Baked-in core prompt (always present, cannot be overridden) ──
  // Determines AI behaviour based on which features are enabled.

  // Figure out primary goal based on enabled features
  let goalSection: string;

  if (quoteDrafting) {
    // Quoting is ON → probe for job details so a quote can be drafted
    goalSection = `Your goal: gather enough detail about what the lead needs so the team can prepare a quote. Ask short, specific questions one at a time (e.g. "What size is the roof?" or "How many rooms?"). Once you have enough info, reply with something like "Nice one, we'll get a rough estimate over to you shortly." Never promise exact pricing.`;
    if (callbackEnabled && onsiteEnabled) {
      goalSection += `\nIf the lead would rather just chat to someone, offer a call instead of continuing to gather details.`;
    } else if (callbackEnabled) {
      goalSection += `\nIf the lead would rather just chat to someone, let them know the team will give them a call shortly. Do not offer specific times.`;
    }
    if (onsiteEnabled) {
      goalSection += `\nIf the job sounds like it needs a look in person, offer for one of the team to come out.`;
    }
  } else if (callbackEnabled && onsiteEnabled) {
    // No quoting, but callbacks and on-site are ON
    goalSection = `Your goal: offer for a team member to give them a call or come out for a visit. Do NOT ask for job details, sizing, or scope - that is for the team to handle on the call or visit. For callbacks, once interest is confirmed just let them know the team will be in touch shortly. For on-site visits, lock in a day and time.`;
  } else if (callbackEnabled) {
    // Only callbacks ON
    goalSection = `Your goal: confirm the lead is interested and let them know the team will be in touch shortly. Do NOT ask for job details, sizing, or scope. Do NOT offer or suggest specific days, times, or time slots for a callback - the team will handle scheduling. Once interest is confirmed, simply say something like "Nice one, the team will give you a call shortly." and end the conversation naturally.`;
  } else if (onsiteEnabled) {
    // Only on-site ON
    goalSection = `Your goal: schedule a time for one of the team to come out for a visit. Do NOT ask for job details, sizing, or scope - just confirm interest and lock in a visit time.`;
  } else {
    // Nothing enabled - just answer questions
    goalSection = `Your goal: answer any questions the lead has about ${service} and let them know the team will be in touch.`;
  }

  // Callback scheduling rules - only used when on-site is also enabled
  // (so the AI needs to coordinate specific times). When callback-only,
  // the goal already tells the AI to just say "the team will be in touch".
  let callbackRules = "";
  if (callbackEnabled && onsiteEnabled) {
    callbackRules = `
CALLBACK SCHEDULING:
Available days: ${callbackDaysList}. Hours: ${callbackStart}–${callbackEnd}.
- If the lead says "any time" or similar, confirm the next available slot.
- If they give a specific time on a valid day within hours, confirm it.
- If outside hours or days, suggest the nearest valid alternative.
- Once a callback is confirmed, just acknowledge it: "Sorted, the team will call you {day} at {time}." Do NOT then ask if they need anything else.`;
  } else if (callbackEnabled) {
    callbackRules = `
CALLBACK RULES:
- Do NOT suggest, offer, or mention specific days, times, or time windows for a callback.
- Never say things like "we'll call you Wednesday" or "how does 2pm sound".
- Once the lead confirms interest, simply let them know the team will be in touch shortly and wrap up.`;
  }

  // On-site scheduling rules (only when enabled)
  let onsiteRules = "";
  if (onsiteEnabled) {
    onsiteRules = `
ON-SITE VISITS:
- If the lead agrees to a visit, confirm a day and time.
- Once confirmed, acknowledge it simply: "All good, someone will be out {day} at {time}."`;
  }

  const now = new Date();
  const todayStr = now.toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: false });

  // Build the JSON action enum and description based on which features are enabled,
  // so the AI is never told it can use "onsite" when on-site visits are turned off.
  const actionEnum = ["none", callbackEnabled && "callback", onsiteEnabled && "onsite", quoteDrafting && "quote"]
    .filter(Boolean).join("|");
  const actionDescParts = [
    callbackEnabled && onsiteEnabled && `"callback" if a call time was confirmed`,
    callbackEnabled && !onsiteEnabled && `"callback" if the lead confirmed interest in a call back`,
    onsiteEnabled && `"onsite" if an on-site visit was confirmed`,
    quoteDrafting && `"quote" if enough detail gathered for a quote`,
  ].filter(Boolean) as string[];
  const actionDesc = actionDescParts.length > 0 ? actionDescParts.join(", ") + `. Otherwise "none".` : `"none".`;

  // Hard prohibitions injected into the numbered RULES so the AI doesn't offer
  // disabled booking types in conversation (not just in the JSON action field).
  const disabledTypeRules: string[] = [];
  if (!onsiteEnabled) {
    disabledTypeRules.push(`Never offer, suggest, or mention an on-site visit or someone coming out. On-site visits are not available.`);
  }
  if (!callbackEnabled) {
    disabledTypeRules.push(`Never offer, suggest, or mention scheduling a phone call or callback. Callbacks are not available.`);
  }

  const leadNameLine = leadFirstName
    ? `The lead's name is ${leadFirstName}.`
    : `The lead's name is unknown - do not use a name.`;

  const bakedPrompt = `You are a friendly assistant for ${companyName} (${area}), handling SMS enquiries about ${service}. Text like a real person - casual, warm, brief.

${leadNameLine}

RULES (never break these):
1. Keep every reply under 2 short sentences. Be concise.
2. Never repeat yourself. Read the conversation history - if you already said something, move forward, don't say it again.
3. Never mention AI, automation, software, settings, or internal processes.
4. Never use emojis, asterisks, bullet points, or markdown.
5. Never use filler phrases like "grab the details", "nail down the details", "how does time sound", "does that work", "whenever is convenient", "quick chat", "see how we can assist", "we usually just".
6. Say "the team" or "our team", never refer to anyone by name.
7. Only ask ONE question per message. Do not stack questions.
8. Use the lead's first name only twice: once in your very first reply to acknowledge them, and once when confirming a booked callback or appointment. Never use it in any other message.${disabledTypeRules.length > 0 ? "\n" + disabledTypeRules.map((r, i) => `${i + 9}. ${r}`).join("\n") : ""}

${goalSection}
${callbackRules}
${onsiteRules}

Today: ${todayStr}. Current time: ${timeStr}.

IMPORTANT: After your reply text, output a JSON block on a new line starting with "---JSON---":
---JSON---
{"score": <0-100>, "score_reason": "<brief reason>", "action": "<${actionEnum}>", "appointment_time": "<ISO8601 datetime or null>", "appointment_note": "<brief note or null>", "quote_context": "<summary or null>"}

Score: 0-20 cold, 21-40 mild interest, 41-60 engaged, 61-80 ready, 81-100 confirmed.
Action: ${actionDesc}
appointment_time: full ISO8601 with timezone (e.g. "2026-04-02T14:00:00+10:00").
quote_context: only when action is "quote", summarise what needs quoting.
${quoteStatus ? `\nCurrent quote status: ${quoteStatus}. Do not trigger another quote.` : ""}`;

  // ── Custom prompt (user-editable, appended after baked-in rules) ──
  const customPrompt = config.system_prompt as string | null;
  let finalPrompt = bakedPrompt;

  if (customPrompt) {
    const interpolated = customPrompt
      .replace(/\(company name\)/gi, companyName)
      .replace(/\(area\)/gi, area)
      .replace(/\(service\)/gi, service);
    finalPrompt += `\n\nADDITIONAL COMPANY INSTRUCTIONS:\n${interpolated}`;
  }

  if (companyKnowledge) {
    finalPrompt += companyKnowledge;
  }

  return finalPrompt;
}

// ---------------------------------------------------------------------------
// Parse AI response: split reply text from JSON metadata
// ---------------------------------------------------------------------------
interface AIActions {
  reply: string;
  score: number;
  scoreReason: string;
  action: "none" | "callback" | "onsite" | "quote";
  appointmentTime: string | null;
  appointmentNote: string | null;
  quoteContext: string | null;
}

function parseAIResponse(raw: string): AIActions {
  const jsonMarker = "---JSON---";
  const idx = raw.indexOf(jsonMarker);

  let reply: string;
  let meta: Record<string, unknown> = {};

  if (idx !== -1) {
    reply = raw.substring(0, idx).trim();
    try {
      meta = JSON.parse(raw.substring(idx + jsonMarker.length).trim());
    } catch {
      // If JSON parsing fails, just use the reply with defaults
    }
  } else {
    reply = raw.trim();
  }

  return {
    reply,
    score: typeof meta.score === "number" ? Math.min(100, Math.max(0, meta.score)) : 0,
    scoreReason: (meta.score_reason as string) || "",
    action: (["callback", "onsite", "quote"].includes(meta.action as string)
      ? meta.action
      : "none") as AIActions["action"],
    appointmentTime: (meta.appointment_time as string) || null,
    appointmentNote: (meta.appointment_note as string) || null,
    quoteContext: (meta.quote_context as string) || null,
  };
}

// ---------------------------------------------------------------------------
// Twilio signature validation
// ---------------------------------------------------------------------------
async function validateTwilioSignature(
  req: Request,
  rawBody: string,
  authToken: string,
  canonicalUrl?: string
): Promise<boolean> {
  const signature = req.headers.get("X-Twilio-Signature");
  if (!signature) return false;

  // Use the configured canonical URL (what Twilio signed against) if provided,
  // otherwise fall back to req.url. Supabase edge function URLs may differ from
  // the public webhook URL Twilio signed against, so TWILIO_WEBHOOK_URL should
  // be set to the exact URL configured in the Twilio console.
  const url = canonicalUrl || req.url;
  const params = parseTwilioBody(rawBody);
  const sortedKeys = Object.keys(params).sort();
  const dataToSign = url + sortedKeys.map((k) => k + params[k]).join("");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(dataToSign));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return expected === signature;
}

// =============================================================================
// Out-of-hours gate (AEST / UTC+10, no DST)
// =============================================================================
// Returns true when the current time is outside Mon–Fri 9:00am–5:00pm AEST.
// Uses a fixed UTC+10 offset (Australia/Brisbane) so behaviour is consistent
// year-round and unaffected by NSW/VIC daylight-saving transitions.
function isOutOfHoursAEST(): boolean {
  const nowUtcMs = Date.now();
  const aestOffsetMs = 10 * 60 * 60 * 1000; // UTC+10
  const aest = new Date(nowUtcMs + aestOffsetMs);
  const day = aest.getUTCDay(); // 0=Sun … 6=Sat
  if (day === 0 || day === 6) return true; // weekend
  const minutes = aest.getUTCHours() * 60 + aest.getUTCMinutes();
  return minutes < 9 * 60 || minutes >= 17 * 60; // before 9am or 5pm+
}

// =============================================================================
// Main handler
// =============================================================================
Deno.serve(async (req) => {
  // Twilio sends POST with form-encoded body
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Parse Twilio webhook
    const rawBody = await req.text();
    const params = parseTwilioBody(rawBody);
    const fromNumber = normalisePhone(params.From || "");
    const toNumber = normalisePhone(params.To || "");
    const inboundBody = params.Body || "";

    if (!fromNumber || !toNumber || !inboundBody) {
      return twimlResponse(""); // empty TwiML = no auto-reply
    }

    // 2. Look up company by the Twilio number receiving the message
    const { data: smsConfig, error: configErr } = await db
      .from("sms_agent_config")
      .select("*, companies:company_id(id, name, settings)")
      .eq("twilio_number", toNumber)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (configErr || !smsConfig) {
      console.error("No SMS config for number:", toNumber, configErr);
      return twimlResponse("");
    }

    const companyId: string = smsConfig.company_id;

    // 2b. Validate Twilio webhook signature.
    // TWILIO_WEBHOOK_URL must be set to the exact public URL configured in the
    // Twilio console (e.g. https://<project>.supabase.co/functions/v1/twilio-inbound-sms).
    // Requests that fail signature validation are always rejected.
    const canonicalWebhookUrl = Deno.env.get("TWILIO_WEBHOOK_URL");
    if (!canonicalWebhookUrl) {
      console.error("TWILIO_WEBHOOK_URL is not set - rejecting request. Set this secret to enable the inbound SMS webhook.");
      return twimlResponse("");
    }
    try {
      const twilioAuthForValidation = await resolveKey(db, companyId, "twilio_auth", "");
      const isValid = await validateTwilioSignature(req, rawBody, twilioAuthForValidation, canonicalWebhookUrl);
      if (!isValid) {
        console.error("Twilio signature validation failed - request rejected");
        return twimlResponse("");
      }
    } catch (err) {
      console.error("Twilio signature validation error - request rejected:", (err as Error).message);
      return twimlResponse("");
    }

    // 3. Check SMS credits
    const { data: credits } = await db
      .from("sms_credits")
      .select("balance")
      .eq("company_id", companyId)
      .single();

    if (!credits || credits.balance <= 0) {
      console.warn("No SMS credits for company:", companyId);
      // Log activity but don't reply
      await logActivity(db, companyId, "sms.no_credits", "company", companyId, {
        from: fromNumber,
      });
      return twimlResponse("");
    }

    // 4. Check AI settings
    if (!smsConfig.auto_reply) {
      // AI is off globally - just store the message, don't reply
      await storeInboundOnly(db, companyId, fromNumber, toNumber, inboundBody);
      const optOut = await flagOptOutIfKeyword(db, companyId, fromNumber, inboundBody);
      return twimlResponse(optOut === "stopped" ? "You have been unsubscribed and won't receive further messages. Reply START to opt back in." : "");
    }

    if (smsConfig.out_of_hours_only && !isOutOfHoursAEST()) {
      // Outside configured hours - store but don't reply
      await storeInboundOnly(db, companyId, fromNumber, toNumber, inboundBody);
      const optOut = await flagOptOutIfKeyword(db, companyId, fromNumber, inboundBody);
      return twimlResponse(optOut === "stopped" ? "You have been unsubscribed and won't receive further messages. Reply START to opt back in." : "");
    }

    // 5. Find or create lead by phone number in this company.
    // Twilio reports From in E.164 (+61412345678) but older leads may be
    // stored without the + or in AU local format (0412345678) - try all three
    // so replies thread onto the existing lead instead of forking a new one.
    const phoneCandidates = [fromNumber, fromNumber.replace(/^\+/, "")];
    if (fromNumber.startsWith("+61")) {
      phoneCandidates.push("0" + fromNumber.slice(3));
    }

    // deno-lint-ignore no-explicit-any
    let lead: any = null;
    for (const candidate of phoneCandidates) {
      const { data: match } = await db
        .from("leads")
        .select("*")
        .eq("company_id", companyId)
        .eq("phone", candidate)
        .limit(1)
        .single();
      if (match) {
        lead = match;
        break;
      }
    }

    if (!lead) {
      // Route lead to a rep based on company settings
      const { data: routedRep } = await db.rpc("route_lead", {
        p_company_id: companyId,
        p_postcode: null,
      });

      // Create a new lead from this inbound SMS
      const { data: newLead, error: leadErr } = await db
        .from("leads")
        .insert({
          company_id: companyId,
          first_name: "SMS Lead",
          name: "SMS Lead",
          phone: fromNumber,
          source: "sms_inbound",
          pipeline_stage: "new_lead",
          ai_enabled: true,
          ai_score: 10,
          ai_score_reason: "New inbound SMS enquiry",
          assigned_to: routedRep || null,
        })
        .select()
        .single();

      if (leadErr || !newLead) {
        console.error("Failed to create lead:", leadErr);
        return twimlResponse("");
      }
      lead = newLead;

      await logActivity(db, companyId, "lead.created", "lead", lead.id, {
        source: "sms_inbound",
        phone: fromNumber,
      });

      fireWebhooks(db, companyId, "lead.created", newLead);
    }

    // 6. Check per-lead AI toggle
    if (!lead.ai_enabled) {
      await storeInboundOnly(db, companyId, fromNumber, toNumber, inboundBody, lead.id);
      return twimlResponse("");
    }

    // 7. Get or create conversation
    let { data: conversation } = await db
      .from("conversations")
      .select("*")
      .eq("company_id", companyId)
      .eq("lead_id", lead.id)
      .eq("channel", "sms")
      .eq("is_open", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!conversation) {
      const { data: newConv } = await db
        .from("conversations")
        .insert({
          company_id: companyId,
          lead_id: lead.id,
          channel: "sms",
          is_open: true,
          sms_config_id: smsConfig.id,
          last_message: inboundBody,
          last_message_at: new Date().toISOString(),
        })
        .select()
        .single();
      conversation = newConv;
    }

    if (!conversation) {
      console.error("Failed to create conversation");
      return twimlResponse("");
    }

    // 8. Store inbound message
    const { error: inboundMsgErr } = await db.from("messages").insert({
      conversation_id: conversation.id,
      direction: "inbound",
      body: inboundBody,
      channel: "sms",
      is_ai_generated: false,
      metadata: { from: fromNumber, to: toNumber, twilio_sid: params.MessageSid || null },
    });
    if (inboundMsgErr) console.error("Failed to store inbound message:", inboundMsgErr);

    // Update conversation last message
    const { error: convUpdErr } = await db
      .from("conversations")
      .update({
        last_message: inboundBody,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    if (convUpdErr) console.error("Failed to update conversation:", convUpdErr);

    // ── STOP / START opt-out handling (Australian Spam Act) ─────────────────────
    // Runs for every company. STOP flags the lead so the AI, manual and bulk
    // sends can never message them again; START clears it.
    const optKw = inboundBody.trim().toUpperCase().replace(/[.!,?]/g, "").replace(/\s+/g, " ").trim();
    const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT-OUT", "OPT OUT"]);
    const START_WORDS = new Set(["START", "UNSTOP", "RESUBSCRIBE", "OPTIN", "OPT-IN", "OPT IN"]);
    if (STOP_WORDS.has(optKw)) {
      await db.from("leads").update({ sms_opted_out: true, sms_opted_out_at: new Date().toISOString() }).eq("id", lead.id);
      return twimlResponse("You have been unsubscribed and won't receive further messages. Reply START to opt back in.");
    }
    if (START_WORDS.has(optKw)) {
      await db.from("leads").update({ sms_opted_out: false, sms_opted_out_at: null }).eq("id", lead.id);
      return twimlResponse("You're resubscribed. Reply STOP at any time to opt out.");
    }
    // Already opted out and this isn't a START - store the inbound (done above) but never reply.
    if (lead.sms_opted_out === true) {
      return twimlResponse("");
    }

    // Get conversation history (last 20 messages for context)
    const { data: history } = await db
      .from("messages")
      .select("direction, body, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(20);

    const conversationMessages = (history || []).map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.body,
    }));

    // Check quote status for this lead
    const { data: latestQuote } = await db
      .from("quotes")
      .select("status")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const quoteStatus = latestQuote?.status || null;

    // Check for max messages limit
    const aiMessageCount = (history || []).filter(
      (m) => m.direction === "outbound"
    ).length;
    if (smsConfig.max_messages && aiMessageCount >= smsConfig.max_messages) {
      console.warn("Max AI messages reached for conversation:", conversation.id);
      await logActivity(db, companyId, "sms.max_messages", "conversation", conversation.id, {
        lead_id: lead.id,
        count: aiMessageCount,
      });
      return twimlResponse("");
    }

    // 9. Resolve API keys from edge-function secrets
    let openaiKey: string;
    let twilioSid: string;
    let twilioAuth: string;
    try {
      openaiKey = await resolveKey(db, companyId, "openai", "");
      twilioSid = await resolveKey(db, companyId, "twilio", "");
      twilioAuth = await resolveKey(db, companyId, "twilio_auth", "");
    } catch (keyErr) {
      console.error("API key resolution failed:", keyErr);
      await logActivity(db, companyId, "sms.key_error", "company", companyId, {
        error: (keyErr as Error).message,
      });
      return twimlResponse("");
    }

    // 10. Build prompt + call OpenAI (with company knowledge enrichment)
    // isSuperAdminCompany is true only for the one company tied to a
    // profiles.is_admin=true user - every other company is unaffected.
    const { data: superAdminProfile } = await db
      .from("profiles")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();
    const isSuperAdminCompany = !!superAdminProfile;

    const companyKnowledge = await fetchCompanyKnowledge(db, companyId);
    const systemPrompt = buildSystemPrompt(smsConfig, lead, quoteStatus, companyKnowledge, isSuperAdminCompany);
    const model = smsConfig.model || "gpt-4o";

    const aiRaw = await callOpenAI(openaiKey, model, systemPrompt, conversationMessages);

    // 11. Parse response
    const actions = parseAIResponse(aiRaw);

    if (!actions.reply) {
      console.warn("AI returned empty reply");
      return twimlResponse("");
    }

    // 12. Update lead score + advance pipeline appropriately
    // Pipeline progression: new_lead → follow_up → quote_in_progress → quoted → closed_won/lost
    // AI should move leads forward through stages, never skip to closed_won.
    if (actions.score > 0) {
      let newStage: string | undefined = undefined;

      // Only advance forward, never backwards
      if (lead.pipeline_stage === "new_lead" && actions.score >= 61) {
        newStage = "follow_up";
      }

      await db
        .from("leads")
        .update({
          ai_score: actions.score,
          ai_score_reason: actions.scoreReason,
          pipeline_stage: newStage ?? undefined,
        })
        .eq("id", lead.id);
    }

    // 13. Create appointment if callback or onsite was confirmed
    if (
      (actions.action === "callback" && smsConfig.callback_enabled) ||
      (actions.action === "onsite" && smsConfig.onsite_enabled)
    ) {
      const startTime = actions.appointmentTime
        ? new Date(actions.appointmentTime)
        : getNextAvailableSlot(smsConfig);

      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min slot

      const appointmentType = actions.action === "callback" ? "callback" : "onsite";
      const leadName = getLeadDisplayName(lead);
      const title =
        actions.action === "callback"
          ? `Callback: ${leadName}`
          : `Site Visit: ${leadName}`;

      await db.from("appointments").insert({
        company_id: companyId,
        lead_id: lead.id,
        assigned_to: lead.assigned_to || null,
        title,
        description: actions.appointmentNote || `Auto-scheduled from SMS conversation`,
        status: "scheduled",
        appointment_type: appointmentType,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        booked_by: "ai",
      });

      // Advance pipeline to follow_up if still at new_lead
      if (lead.pipeline_stage === "new_lead") {
        await db
          .from("leads")
          .update({ pipeline_stage: "follow_up" })
          .eq("id", lead.id);
      }

      await logActivity(db, companyId, "appointment.created", "lead", lead.id, {
        type: appointmentType,
        start_time: startTime.toISOString(),
        source: "ai_sms",
        booked_by: "ai",
      });

      fireWebhooks(db, companyId, "appointment.booked", { lead_id: lead.id, lead_name: leadName, appointment_type: appointmentType, start_time: startTime.toISOString() });

      // Create notification for AI-booked appointment
      const notifTitle = appointmentType === "callback"
        ? `AI booked a callback with ${leadName}`
        : `AI booked an on-site visit with ${leadName}`;
      const notifMessage = `Scheduled for ${startTime.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}`;

      const { error: notifErr } = await db.from("notifications").insert({
        company_id: companyId,
        lead_id: lead.id,
        type: appointmentType === "callback" ? "callback_booked" : "onsite_booked",
        title: notifTitle,
        message: notifMessage,
        metadata: {
          appointment_type: appointmentType,
          start_time: startTime.toISOString(),
          source: "ai_sms",
        },
      });
      if (notifErr) console.error("Failed to create notification:", notifErr);

      // Send email notification via Resend - must be awaited so Deno Deploy
      // doesn't recycle the isolate before the email is actually sent.
      const companyData = smsConfig.companies || {};
      const companyName = String(companyData.name || "Your company");
      const scheduledTimeStr = startTime.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
      const emailContent = appointmentType === "callback"
        ? callbackBookedEmail(leadName, scheduledTimeStr, companyName)
        : onsiteBookedEmail(leadName, scheduledTimeStr, companyName);
      await sendNotificationEmail(db, companyId, emailContent)
        .catch((err) => console.error("Notification email failed:", err));

      // Trigger AI learner to extract scheduling insights
      triggerAILearner("appointment.booked", companyId, lead.id, {
        appointment_type: appointmentType,
        source: "ai_sms",
      });
    }

    // 14. Trigger quote-draft edge function if conditions met
    if (
      actions.action === "quote" &&
      smsConfig.quote_drafting_enabled &&
      !latestQuote // no existing quote
    ) {
      // Advance pipeline to quote_in_progress (not closed_won)
      if (["new_lead", "follow_up"].includes(lead.pipeline_stage)) {
        await db
          .from("leads")
          .update({ pipeline_stage: "quote_in_progress" })
          .eq("id", lead.id);
      }

      // Fire-and-forget call to quote-draft function
      // It will use the conversation context and pricing config to build a draft.
      // The quote-draft function creates the notification (with quote_id) itself.
      try {
        const quotePayload = {
          company_id: companyId,
          lead_id: lead.id,
          conversation_id: conversation.id,
          quote_context: actions.quoteContext,
          lead_name: getLeadDisplayName(lead),
          lead_phone: lead.phone,
          service_type: lead.service_type || smsConfig.service_description || null,
          conversation_summary: (history || [])
            .slice(-10) // last 10 messages for context
            .map((m) => `${m.direction === "inbound" ? "Lead" : "Us"}: ${m.body}`)
            .join("\n"),
        };

        // Async call - don't await, don't block the SMS reply
        fetch(`${SUPABASE_URL}/functions/v1/quote-draft`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(quotePayload),
        }).catch((err) => console.error("quote-draft trigger failed:", err));

        await logActivity(db, companyId, "quote.draft_triggered", "lead", lead.id, {
          quote_context: actions.quoteContext,
          source: "ai_sms",
        });
      } catch (err) {
        console.error("Failed to trigger quote-draft:", err);
      }
    }

    // 14b. Generate AI summary when a goal was met (callback, onsite, or quote)
    if (actions.action === "callback" || actions.action === "onsite" || actions.action === "quote") {
      try {
        const summaryMessages = (history || [])
          .slice(-20)
          .map((m) => `${m.direction === "inbound" ? "Lead" : "Us"}: ${m.body}`)
          .join("\n");

        const summaryPrompt = `You are summarising a business conversation for a CRM. Given the conversation below, produce a JSON object with exactly these keys:
- "summary": a concise 2-3 sentence summary of the conversation so far, including what the lead wants, any appointments or quotes discussed, and current status.
- "score": an integer 0-100 reflecting lead quality / likelihood to convert.
- "status": one of "hot", "warm", "cold" based on the score (>=75 hot, >=40 warm, else cold).

Conversation:
${summaryMessages}

Latest action taken: ${actions.action}
${actions.appointmentTime ? "Appointment time: " + actions.appointmentTime : ""}
${actions.quoteContext ? "Quote context: " + actions.quoteContext : ""}

Respond ONLY with the JSON object, no markdown fences.`;

        const summaryRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: summaryPrompt }],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        if (summaryRes.ok) {
          const summaryJson = await summaryRes.json();
          const rawContent = summaryJson.choices?.[0]?.message?.content?.trim() ?? "";
          try {
            const parsed = JSON.parse(rawContent);
            const aiStatus = (parsed.status === "hot" || parsed.status === "warm" || parsed.status === "cold") ? parsed.status : aiStatusFromScore(parsed.score ?? actions.score);
            const leadUpdate: Record<string, unknown> = {
              ai_summary: parsed.summary || null,
              ai_status: aiStatus,
            };
            const finalScore = parsed.score ?? actions.score;
            if (typeof finalScore === "number" && finalScore >= 0 && finalScore <= 100) {
              leadUpdate.ai_score = finalScore;
            }
            await db.from("leads").update(leadUpdate).eq("id", lead.id);
          } catch {
            // If JSON parse fails, store raw as summary
            await db.from("leads").update({
              ai_summary: rawContent || null,
              ai_status: aiStatusFromScore(actions.score),
            }).eq("id", lead.id);
          }
        }
      } catch (summaryErr) {
        console.error("AI summary generation failed:", summaryErr);
      }
    }

    // 15. Deduct SMS credit + send reply via Twilio
    const { data: creditOk } = await db.rpc("deduct_sms_credit", {
      p_company_id: companyId,
    });

    if (!creditOk) {
      console.warn("Failed to deduct SMS credit");
      return twimlResponse("");
    }

    // Apply reply delay if configured
    // Column was originally reply_delay, later renamed to reply_delay_seconds
    const replyDelay = smsConfig.reply_delay_seconds ?? smsConfig.reply_delay ?? 0;
    if (replyDelay > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, replyDelay * 1000)
      );
    }

    await sendTwilioSMS(twilioSid, twilioAuth, toNumber, fromNumber, actions.reply);

    // 16. Store outbound message
    const { error: outMsgErr } = await db.from("messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      body: actions.reply,
      channel: "sms",
      is_ai_generated: true,
      agent_type: "ai",
      metadata: {
        model,
        score: actions.score,
        action: actions.action,
      },
    });
    if (outMsgErr) console.error("Failed to store outbound message:", outMsgErr);

    // Update conversation last message
    const { error: convUpdErr2 } = await db
      .from("conversations")
      .update({
        last_message: actions.reply,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversation.id);
    if (convUpdErr2) console.error("Failed to update conversation after reply:", convUpdErr2);

    await logActivity(db, companyId, "sms.ai_reply", "lead", lead.id, {
      score: actions.score,
      action: actions.action,
    });

    // Return empty TwiML (we send via API, not TwiML reply)
    return twimlResponse("");
  } catch (err) {
    console.error("Inbound SMS handler error:", err);
    return twimlResponse("");
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Return TwiML response (Twilio expects this)
function twimlResponse(message: string): Response {
  const twiml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

  return new Response(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Store inbound message when AI is off (still want to capture the message)
async function storeInboundOnly(
  db: SupabaseClient,
  companyId: string,
  fromNumber: string,
  toNumber: string,
  body: string,
  leadId?: string
): Promise<void> {
  // Find or create conversation
  let conversationId: string | null = null;

  if (leadId) {
    const { data: conv } = await db
      .from("conversations")
      .select("id")
      .eq("company_id", companyId)
      .eq("lead_id", leadId)
      .eq("channel", "sms")
      .eq("is_open", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    conversationId = conv?.id || null;
  }

  if (!conversationId) {
    const { data: newConv, error: convErr } = await db
      .from("conversations")
      .insert({
        company_id: companyId,
        lead_id: leadId || null,
        channel: "sms",
        is_open: true,
        last_message: body,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (convErr) console.error("storeInboundOnly: conversation insert failed:", convErr);
    conversationId = newConv?.id || null;
  }

  if (conversationId) {
    const { error: msgErr } = await db.from("messages").insert({
      conversation_id: conversationId,
      direction: "inbound",
      body,
      channel: "sms",
      is_ai_generated: false,
      metadata: { from: fromNumber, to: toNumber },
    });
    if (msgErr) console.error("storeInboundOnly: message insert failed:", msgErr);

    const { error: updErr } = await db
      .from("conversations")
      .update({ last_message: body, last_message_at: new Date().toISOString() })
      .eq("id", conversationId);
    if (updErr) console.error("storeInboundOnly: conversation update failed:", updErr);
  }
}

// Get display name from a lead record
function getLeadDisplayName(lead: Record<string, unknown>): string {
  return `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || (lead.name as string) || "Lead";
}

// Log to activity_log
async function logActivity(
  db: SupabaseClient,
  companyId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>
): Promise<void> {
  await db.from("activity_log").insert({
    company_id: companyId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

// Calculate next available callback slot based on config
function getNextAvailableSlot(config: Record<string, unknown>): Date {
  const rawDays = config.callback_days;
  const days: string[] = Array.isArray(rawDays) ? rawDays : ["tue", "wed", "fri", "sat"];
  const startStr = (config.callback_hours_start as string) || "09:00";
  const endStr = (config.callback_hours_end as string) || "17:00";

  const dayMap: Record<string, number> = {
    sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
  };
  const allowedDays = days.map((d: string) => dayMap[d]).filter((d) => d !== undefined);

  const [startH, startM] = startStr.split(":").map(Number);
  const [endH, endM] = endStr.split(":").map(Number);

  const now = new Date();
  const candidate = new Date(now);

  // Round up to next 30-minute slot
  candidate.setMinutes(Math.ceil(candidate.getMinutes() / 30) * 30, 0, 0);

  // Search up to 14 days ahead
  for (let i = 0; i < 14; i++) {
    const day = candidate.getDay();
    if (allowedDays.includes(day)) {
      const h = candidate.getHours();
      const m = candidate.getMinutes();
      const currentMins = h * 60 + m;
      const startMins = startH * 60 + startM;
      const endMins = endH * 60 + endM;

      if (currentMins >= startMins && currentMins < endMins) {
        return candidate;
      }

      if (currentMins < startMins) {
        candidate.setHours(startH, startM, 0, 0);
        return candidate;
      }
    }

    // Move to next day at start time
    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(startH, startM, 0, 0);
  }

  // Fallback: tomorrow at start time
  const fallback = new Date(now);
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(startH, startM, 0, 0);
  return fallback;
}
