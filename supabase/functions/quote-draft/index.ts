// =============================================================================
// LeadGenRentalsHQ - Quote Draft Generator
// =============================================================================
// Triggered by twilio-inbound-sms when AI detects the lead is ready for a quote.
// Receives conversation context and creates a draft quote with AI-extracted details.
//
// Payload from twilio-inbound-sms:
// {
//   company_id, lead_id, conversation_id,
//   quote_context,          - AI summary of what needs quoting
//   lead_name, lead_phone,
//   service_type,           - from lead or company config
//   conversation_summary    - last 10 messages formatted as text
// }
//
// Uses the company's quote_pricing_config to generate line items via OpenAI.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Inline email template (avoids local-file import that breaks deployment) ──
const _BRAND_COLOR = "#1f6fff";
const _BRAND_NAME = "LeadGenRentalsHQ";
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
function quoteDraftedEmail(leadName: string, quoteNumber: string, total: string, companyName: string): { subject: string; html: string } {
  return {
    subject: `Quote ${quoteNumber} drafted for ${leadName}`,
    html: _baseLayout(`
      <h2 style="margin:0 0 16px;font-size:18px;color:#111827">Quote Drafted</h2>
      <p style="margin:0 0 8px;font-size:14px;color:#374151">Your AI assistant has drafted a quote for <strong>${leadName}</strong>.</p>
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Quote:</strong> ${quoteNumber}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Total:</strong> ${total}</p>
      <p style="margin:0 0 8px;font-size:14px;color:#374151"><strong>Company:</strong> ${companyName}</p>
      <p style="margin:16px 0 0;font-size:13px;color:#6b7280">Log in to review the quote, make adjustments, and send it to the lead.</p>
    `),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── Verify internal caller - must supply the service role key as Bearer token ──
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const callerToken = authHeader.replace(/^Bearer\s+/i, "");
  // Constant-time comparison to prevent timing attacks
  const keyBytes = new TextEncoder().encode(callerToken);
  const expectedBytes = new TextEncoder().encode(serviceRoleKey);
  let isMatch = keyBytes.length === expectedBytes.length && keyBytes.length > 0;
  const len = Math.max(keyBytes.length, expectedBytes.length);
  for (let i = 0; i < len; i++) {
    if ((keyBytes[i] ?? 0) !== (expectedBytes[i] ?? 0)) isMatch = false;
  }
  if (!isMatch) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const {
      company_id,
      lead_id,
      conversation_id,
      quote_context,
      lead_name,
      lead_phone,
      service_type,
      conversation_summary,
    } = await req.json();

    if (!company_id || !lead_id) {
      return new Response(JSON.stringify({ error: "company_id and lead_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Check if a quote already exists for this lead (prevent duplicates)
    const { data: existing } = await db
      .from("quotes")
      .select("id")
      .eq("lead_id", lead_id)
      .limit(1)
      .single();

    if (existing) {
      return new Response(JSON.stringify({ message: "Quote already exists", quote_id: existing.id }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Generate quote number
    const quoteNumber = `Q-${Date.now().toString(36).toUpperCase()}`;

    // Build notes from AI context
    const notes = [
      quote_context ? `AI Context: ${quote_context}` : null,
      service_type ? `Service: ${service_type}` : null,
      lead_name ? `Lead: ${lead_name}` : null,
      lead_phone ? `Phone: ${lead_phone}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    // ─── Load pricing config and generate line items via AI ────────────────
    let lineItems: Array<Record<string, unknown>> = [];
    let subtotal = 0;
    let tax = 0;
    let total = 0;
    let taxRate = 0;
    let taxMode = "exclusive";

    // Load company's pricing config from sms_agent_config
    const { data: smsConfig } = await db
      .from("sms_agent_config")
      .select("quote_pricing_config")
      .eq("company_id", company_id)
      .limit(1)
      .single();

    const pricingConfig = smsConfig?.quote_pricing_config || {};
    const pricingItems = Array.isArray(pricingConfig.items) ? pricingConfig.items : [];
    taxRate = typeof pricingConfig.tax_rate === "number" ? pricingConfig.tax_rate : 0;
    taxMode = pricingConfig.tax_mode || "exclusive";

    if (pricingItems.length > 0 && (quote_context || conversation_summary)) {
      // Use OpenAI to interpret conversation context and generate line items
      // based on the company's pricing configuration
      const openAiKey = Deno.env.get("OPEN_AI_API_KEY");
      if (openAiKey) {
        try {
          const pricingDescription = pricingItems
            .map((p: Record<string, unknown>) => `- ${p.description}: ${p.type} @ $${p.rate} ${p.unit || ""}`)
            .join("\n");

          const aiPrompt = `You are a quoting assistant. Based on the conversation context and available pricing items, generate appropriate quote line items as JSON.

Available pricing items:
${pricingDescription}
${pricingConfig.formula ? `\nPricing formula/notes: ${pricingConfig.formula}` : ""}

Conversation context: ${quote_context || "No specific context"}
Conversation summary:
${conversation_summary || "No conversation history"}

Service type: ${service_type || "General"}

Generate a JSON array of line items. Each item should have:
- "description": string (clear description of the work/material)
- "quantity": number (estimated quantity based on conversation details, use 1 if unknown)
- "unit_price": number (from the pricing items above)
- "subtotal": number (quantity × unit_price)

Only include items that are relevant to what the lead is asking about. If the conversation mentions specific measurements (m², hours, kW, etc.), use those to calculate quantities. If no specific quantities are mentioned, use reasonable estimates and note them.

Return ONLY a valid JSON array, no other text.`;

          const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openAiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o",
              messages: [{ role: "user", content: aiPrompt }],
              temperature: 0.3,
              max_tokens: 1000,
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content?.trim() || "";
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (Array.isArray(parsed)) {
                lineItems = parsed.map((item: Record<string, unknown>) => ({
                  description: String(item.description || ""),
                  quantity: Number(item.quantity) || 1,
                  unit_price: Number(item.unit_price) || 0,
                  subtotal: Math.round((Number(item.quantity || 1) * Number(item.unit_price || 0)) * 100) / 100,
                }));
                subtotal = Math.round(lineItems.reduce((sum, li) => sum + (Number(li.subtotal) || 0), 0) * 100) / 100;
                if (taxMode === "inclusive") {
                  // Prices already include GST - back-calculate
                  total = subtotal;
                  tax = Math.round((subtotal - subtotal / (1 + taxRate / 100)) * 100) / 100;
                  subtotal = Math.round((total - tax) * 100) / 100;
                } else {
                  tax = Math.round(subtotal * (taxRate / 100) * 100) / 100;
                  total = Math.round((subtotal + tax) * 100) / 100;
                }
              }
            }
          }
        } catch (aiErr) {
          console.error("AI line item generation failed, creating draft without items:", aiErr);
        }
      }
    }

    const { data: quote, error } = await db
      .from("quotes")
      .insert({
        company_id,
        lead_id,
        quote_number: quoteNumber,
        status: "draft",
        notes,
        line_items: lineItems,
        subtotal,
        tax,
        total,
        metadata: {
          source: "ai_sms",
          conversation_id,
          quote_context,
          conversation_summary: conversation_summary?.slice(0, 2000), // cap length
          pricing_config_used: pricingItems.length > 0,
          tax_rate: taxRate,
          tax_mode: taxMode,
          currency: pricingConfig.currency || "AUD",
        },
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create quote:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Log activity
    await db.from("activity_log").insert({
      company_id,
      action: "quote.drafted",
      entity_type: "quote",
      entity_id: quote.id,
      details: {
        quote_number: quoteNumber,
        lead_id,
        quote_context,
        source: "ai_sms",
        line_items_count: lineItems.length,
        total,
      },
    });

    console.log(`Quote ${quoteNumber} drafted for lead ${lead_id} (${lineItems.length} line items, total: ${total})`);

    // Create notification with quote_id so dashboard can show "Approve & Send"
    await db.from("notifications").insert({
      company_id,
      lead_id,
      type: "quote_drafted",
      title: `AI drafted a quote for ${lead_name || "a lead"}`,
      message: quote_context || "Quote drafted from SMS conversation - review and approve to send.",
      metadata: {
        quote_id: quote.id,
        quote_number: quoteNumber,
        quote_context,
        total,
        line_items_count: lineItems.length,
        source: "ai_sms",
      },
    }).catch((notifErr: unknown) => console.error("Failed to create notification:", notifErr));

    // Send email notification via Resend (non-blocking)
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        // Look up company name
        const { data: company } = await db
          .from("companies")
          .select("name")
          .eq("id", company_id)
          .single();

        // Look up owners/admins to email
        const { data: ownerProfiles } = await db
          .from("profiles")
          .select("id")
          .eq("company_id", company_id)
          .in("role", ["owner", "admin"]);

        if (ownerProfiles && ownerProfiles.length > 0) {
          const emails: string[] = [];
          for (const profile of ownerProfiles) {
            const { data: userData } = await db.auth.admin.getUserById(profile.id);
            if (userData?.user?.email) {
              emails.push(userData.user.email);
            }
          }

          if (emails.length > 0) {
            const fmtTotal = new Intl.NumberFormat("en-AU", {
              style: "currency",
              currency: pricingConfig.currency || "AUD",
            }).format(total);

            const emailContent = quoteDraftedEmail(
              lead_name || "a lead",
              quoteNumber,
              fmtTotal,
              company?.name || "Your company",
            );

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
          }
        }
      }
    } catch (emailErr) {
      console.error("Notification email failed:", emailErr);
    }

    return new Response(JSON.stringify({ success: true, quote }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("quote-draft error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
