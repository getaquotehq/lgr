// =============================================================================
// AI Learner - Automated Knowledge Extraction Pipeline
// =============================================================================
// Triggered when key outcome events occur (closed_won, closed_lost,
// quote.accepted, appointment.booked). Analyzes the full interaction history
// and extracts structured learnings into company_knowledge.
//
// Also computes AI performance stats for the analytics dashboard.
//
// Payload:
//   { event, company_id, lead_id, metadata? }
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Minimum prefix length for substring-based duplicate detection
const DEDUP_PREFIX_LENGTH = 30;

// Skip OpenAI extraction if this lead was already analyzed within this window
const DEDUP_WINDOW_HOURS = 24;

// Max style learnings per company before skipping further style calibration
const MAX_STYLE_LEARNINGS = 5;

// Minimum interval between stats recomputations per company (in minutes)
const STATS_THROTTLE_MINUTES = 60;

// Milliseconds in one hour - used for time-window calculations
const MS_PER_HOUR = 60 * 60 * 1000;

// Use the cheaper mini model for structured extraction tasks
const EXTRACTION_MODEL = "gpt-4o-mini";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Key resolution (same pattern as other edge functions)
// ---------------------------------------------------------------------------
const ENV_FALLBACKS: Record<string, string> = {
  openai: "OPEN_AI_API_KEY",
};

async function resolveOpenAIKey(
  db: ReturnType<typeof createClient>,
  companyId: string,
): Promise<string | null> {
  const { data, error } = await db.rpc("resolve_api_key", {
    p_company_id: companyId,
    p_provider: "openai",
  });
  if (!error && data) return data as string;

  const envVal = Deno.env.get("OPEN_AI_API_KEY");
  if (envVal) return envVal;

  return null;
}

// ---------------------------------------------------------------------------
// Gather full interaction history for a lead
// ---------------------------------------------------------------------------
async function gatherLeadHistory(
  db: ReturnType<typeof createClient>,
  leadId: string,
): Promise<{ smsHistory: string; lead: Record<string, unknown> | null }> {
  // Get lead data
  const { data: lead } = await db
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  // Get all SMS messages for this lead (via conversations)
  const { data: conversations } = await db
    .from("conversations")
    .select("id")
    .eq("lead_id", leadId)
    .eq("channel", "sms");

  let smsHistory = "";
  if (conversations && conversations.length > 0) {
    const convIds = conversations.map((c) => c.id);
    const { data: messages } = await db
      .from("messages")
      .select("direction, body, is_ai_generated, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: true })
      .limit(100);

    if (messages && messages.length > 0) {
      smsHistory = messages
        .map((m) => {
          const sender = m.direction === "inbound" ? "Lead" : (m.is_ai_generated ? "AI" : "Human Agent");
          return `${sender}: ${m.body}`;
        })
        .join("\n");
    }
  }

  return { smsHistory, lead };
}

// ---------------------------------------------------------------------------
// Extract learnings via OpenAI
// ---------------------------------------------------------------------------
async function extractLearnings(
  openaiKey: string,
  event: string,
  smsHistory: string,
  lead: Record<string, unknown>,
  metadata?: Record<string, unknown>,
): Promise<Array<{
  category: string;
  insight: string;
  tags: string[];
  source_type: string;
}>> {
  const outcomeContext =
    event === "closed_won"
      ? "This lead was SUCCESSFULLY CONVERTED (closed won). Analyze what worked well."
      : event === "closed_lost"
        ? "This lead was LOST (closed lost). Analyze what went wrong and what could be improved."
        : event === "quote.accepted"
          ? "The quote was ACCEPTED by the lead. Analyze the quoting approach that worked."
          : event === "appointment.booked"
            ? "An appointment was successfully BOOKED. Analyze the scheduling approach that worked."
            : "Analyze this interaction for useful patterns.";

  const prompt = `You are an AI conversation analyst for a business CRM. ${outcomeContext}

Given the interaction history below, extract 1-4 specific, actionable learnings that can improve future AI conversations with similar leads.

${smsHistory ? `SMS CONVERSATION:\n${smsHistory}\n` : ""}
Lead info: Score=${lead.ai_score || "N/A"}, Pipeline=${lead.pipeline_stage || "N/A"}, Source=${lead.source || "N/A"}
${metadata ? `Additional context: ${JSON.stringify(metadata)}` : ""}

For each learning, provide:
- category: one of "winning_pattern", "failed_pattern", "objection_response", "scheduling_approach", "quote_approach", "service_insight", "style_preference"
- insight: a concise, actionable statement (max 2 sentences) that can be injected into a future AI prompt. Write it as an instruction, e.g., "When leads ask about pricing, provide a range rather than exact numbers to keep the conversation open."
- tags: 1-3 relevant tags (e.g., "pricing", "scheduling", "objection", "urgency", "tone")
- source_type: "sms" or "mixed" based on where the key interaction happened

Respond ONLY with a JSON array of objects. No markdown fences.
Example: [{"category":"winning_pattern","insight":"...","tags":["pricing","urgency"],"source_type":"sms"}]

If the conversation is too short or there's insufficient data to extract meaningful learnings, return an empty array [].`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      max_tokens: 800,
    }),
  });

  if (!res.ok) {
    console.error("OpenAI extraction failed:", res.status);
    return [];
  }

  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "[]";

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Validate and sanitize each learning
    const validCategories = [
      "winning_pattern", "failed_pattern", "objection_response",
      "scheduling_approach", "quote_approach", "service_insight", "style_preference",
    ];
    const validSources = ["sms", "voice", "mixed"];

    return parsed
      .filter(
        (l: Record<string, unknown>) =>
          l.insight &&
          typeof l.insight === "string" &&
          l.insight.length > 10 &&
          validCategories.includes(l.category as string),
      )
      .map((l: Record<string, unknown>) => ({
        category: l.category as string,
        insight: (l.insight as string).slice(0, 500),
        tags: Array.isArray(l.tags)
          ? (l.tags as string[]).filter((t) => typeof t === "string").slice(0, 5)
          : [],
        source_type: validSources.includes(l.source_type as string)
          ? (l.source_type as string)
          : "mixed",
      }))
      .slice(0, 4); // Max 4 learnings per event
  } catch {
    console.error("Failed to parse AI learnings response");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Style calibration: analyze successful conversations for style patterns
// ---------------------------------------------------------------------------
async function extractStyleCalibration(
  openaiKey: string,
  smsHistory: string,
  event: string,
): Promise<Array<{
  category: string;
  insight: string;
  tags: string[];
  source_type: string;
}>> {
  // Only run style calibration on successful outcomes
  if (event !== "closed_won" && event !== "appointment.booked") return [];
  if (!smsHistory || smsHistory.length < 100) return [];

  const prompt = `Analyze this successful SMS conversation for communication style patterns. The outcome was successful (${event}).

Conversation:
${smsHistory}

Identify 1-2 specific style characteristics that contributed to success:
- Average message length (short/medium/long)
- Tone (very casual/casual/professional/formal)
- Response approach (direct/consultative/empathetic)
- Follow-up timing patterns if visible

Return a JSON array with objects having:
- category: always "style_preference"
- insight: a concise, actionable style instruction (e.g., "Keep SMS replies under 10 words for this company's customers - they respond best to very brief, direct messages.")
- tags: relevant tags like "tone", "length", "follow-up", "formality"
- source_type: "sms"

Respond ONLY with the JSON array. Return [] if insufficient data.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: EXTRACTION_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 400,
      }),
    });

    if (!res.ok) return [];

    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content?.trim() ?? "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (l: Record<string, unknown>) =>
          l.insight && typeof l.insight === "string" && l.category === "style_preference",
      )
      .map((l: Record<string, unknown>) => ({
        category: "style_preference",
        insight: (l.insight as string).slice(0, 500),
        tags: Array.isArray(l.tags)
          ? (l.tags as string[]).filter((t) => typeof t === "string").slice(0, 5)
          : ["style"],
        source_type: "sms",
      }))
      .slice(0, 2);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Compute performance stats for a company
// ---------------------------------------------------------------------------
async function computePerformanceStats(
  db: ReturnType<typeof createClient>,
  companyId: string,
): Promise<void> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];

  // Fetch all leads for the company
  const { data: leads } = await db
    .from("leads")
    .select("id, ai_score, ai_status, pipeline_stage, source, ai_enabled, created_at")
    .eq("company_id", companyId);

  if (!leads) return;

  const totalLeads = leads.length;
  const aiHandled = leads.filter((l) => l.ai_enabled !== false).length;
  const humanHandled = totalLeads - aiHandled;

  // Count conversions (closed_won)
  const aiConversions = leads.filter(
    (l) => l.pipeline_stage === "closed_won" && l.ai_enabled !== false,
  ).length;
  const humanConversions = leads.filter(
    (l) => l.pipeline_stage === "closed_won" && l.ai_enabled === false,
  ).length;

  const aiConvRate = aiHandled > 0 ? (aiConversions / aiHandled) * 100 : 0;
  const humanConvRate = humanHandled > 0 ? (humanConversions / humanHandled) * 100 : 0;

  // Average AI score
  const scoredLeads = leads.filter(
    (l) => typeof l.ai_score === "number" && l.ai_score > 0,
  );
  const avgScore = scoredLeads.length > 0
    ? scoredLeads.reduce((sum, l) => sum + (l.ai_score as number), 0) / scoredLeads.length
    : 0;

  // Appointments booked by AI
  const { count: callbackCount } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("booked_by", "ai")
    .eq("appointment_type", "callback");

  const { count: onsiteCount } = await db
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("booked_by", "ai")
    .eq("appointment_type", "onsite");

  // Quotes generated
  const { count: quoteCount } = await db
    .from("quotes")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId);

  // Knowledge items
  const { count: knowledgeCount } = await db
    .from("company_knowledge")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("is_active", true);

  // Upsert all-time stats
  await db.from("ai_performance_stats").upsert(
    {
      company_id: companyId,
      period: "all_time",
      period_start: "2020-01-01",
      total_leads: totalLeads,
      ai_handled_leads: aiHandled,
      human_handled_leads: humanHandled,
      ai_conversions: aiConversions,
      human_conversions: humanConversions,
      ai_conversion_rate: Math.round(aiConvRate * 100) / 100,
      human_conversion_rate: Math.round(humanConvRate * 100) / 100,
      avg_ai_score: Math.round(avgScore * 100) / 100,
      callbacks_booked: callbackCount ?? 0,
      onsites_booked: onsiteCount ?? 0,
      quotes_generated: quoteCount ?? 0,
      knowledge_items_count: knowledgeCount ?? 0,
      computed_at: now.toISOString(),
    },
    { onConflict: "company_id,period,period_start" },
  );
}

// ---------------------------------------------------------------------------
// Cross-company anonymized insights (network effect moat)
// ---------------------------------------------------------------------------
async function updateIndustryInsights(
  db: ReturnType<typeof createClient>,
  companyId: string,
): Promise<void> {
  // Get the company's service description to determine industry
  const { data: smsConfig } = await db
    .from("sms_agent_config")
    .select("service_description")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!smsConfig?.service_description) return;

  // Simple industry detection from service description
  const serviceDesc = (smsConfig.service_description as string).toLowerCase();
  const industryKeywords: Record<string, string[]> = {
    plumbing: ["plumb", "pipe", "drain", "water", "tap", "toilet", "hot water"],
    electrical: ["electri", "wiring", "power", "light", "switch", "circuit"],
    roofing: ["roof", "gutter", "tile", "leak"],
    landscaping: ["landscape", "garden", "lawn", "mowing", "tree"],
    cleaning: ["clean", "wash", "carpet", "window clean"],
    building: ["build", "construct", "renovate", "renovation", "extension"],
    hvac: ["hvac", "air condition", "heating", "cooling"],
    painting: ["paint", "colour", "interior paint", "exterior paint"],
    general_trades: ["handyman", "repair", "maintenance", "general"],
  };

  let industry = "general_services";
  for (const [ind, keywords] of Object.entries(industryKeywords)) {
    if (keywords.some((k) => serviceDesc.includes(k))) {
      industry = ind;
      break;
    }
  }

  // Count company's stats for this industry aggregation
  const { data: stats } = await db
    .from("ai_performance_stats")
    .select("ai_conversion_rate, avg_ai_score, callbacks_booked, onsites_booked, quotes_generated, total_leads")
    .eq("company_id", companyId)
    .eq("period", "all_time")
    .maybeSingle();

  if (!stats || stats.total_leads < 10) return; // Need minimum data

  // Count total companies contributing to this industry
  const { count: industryCompanyCount } = await db
    .from("industry_insights")
    .select("id", { count: "exact", head: true })
    .eq("industry", industry)
    .eq("is_active", true);

  const sampleSize = (industryCompanyCount ?? 0) + 1;
  const confidence = Math.min(0.95, sampleSize / 20); // Max confidence at 20+ companies

  // Generate a statistical insight
  const callbackRate = stats.total_leads > 0
    ? ((stats.callbacks_booked / stats.total_leads) * 100).toFixed(1)
    : "0.0";

  const insight = `In the ${industry.replace("_", " ")} industry, AI-assisted leads achieve a ${callbackRate}% callback booking rate. Average AI lead score: ${Math.round(stats.avg_ai_score)}/100.`;

  // Upsert (one insight per industry, updated over time)
  const { data: existing } = await db
    .from("industry_insights")
    .select("id")
    .eq("industry", industry)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await db
      .from("industry_insights")
      .update({
        insight,
        sample_size: sampleSize,
        confidence,
        metadata: { last_contributing_company_count: sampleSize },
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await db.from("industry_insights").insert({
      industry,
      insight,
      sample_size: sampleSize,
      confidence,
      tags: [industry, "conversion", "callbacks"],
      metadata: { last_contributing_company_count: sampleSize },
    });
  }
}

// =============================================================================
// Main handler
// =============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { event, company_id: companyId, lead_id: leadId, metadata } = body;

    if (!event || !companyId) {
      return new Response(
        JSON.stringify({ error: "event and company_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Extract learnings if we have a lead_id ──────────────────────────────
    let extractedCount = 0;

    if (leadId) {
      // ── Dedup guard: skip if this lead was already analyzed recently ─────
      const dedupCutoff = new Date(
        Date.now() - DEDUP_WINDOW_HOURS * MS_PER_HOUR,
      ).toISOString();

      const { count: recentAnalysisCount } = await db
        .from("company_knowledge")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("source_lead_id", leadId)
        .gte("created_at", dedupCutoff);

      if ((recentAnalysisCount ?? 0) > 0) {
        console.log(
          `Lead ${leadId} already analyzed within ${DEDUP_WINDOW_HOURS}h - skipping OpenAI extraction`,
        );
      } else {
        const openaiKey = await resolveOpenAIKey(db, companyId);

        if (openaiKey) {
          const { smsHistory, lead } = await gatherLeadHistory(
            db,
            leadId,
          );

          // Only extract if there's meaningful interaction history
          if (smsHistory.length > 20 && lead) {
            const learnings = await extractLearnings(
              openaiKey,
              event,
              smsHistory,
              lead,
              metadata,
            );

            if (learnings.length > 0) {
              // Check for duplicate insights (simple dedup by similarity)
              const { data: existing } = await db
                .from("company_knowledge")
                .select("insight")
                .eq("company_id", companyId)
                .eq("is_active", true)
                .order("created_at", { ascending: false })
                .limit(50);

              const existingInsights = (existing || []).map((e) =>
                (e.insight as string).toLowerCase().trim(),
              );

              for (const learning of learnings) {
                // Simple dedup: skip if a very similar insight already exists
                const normalised = learning.insight.toLowerCase().trim();
                const isDuplicate = existingInsights.some(
                  (e) =>
                    e === normalised ||
                    (e.length > DEDUP_PREFIX_LENGTH &&
                      normalised.length > DEDUP_PREFIX_LENGTH &&
                      e.substring(0, DEDUP_PREFIX_LENGTH) === normalised.substring(0, DEDUP_PREFIX_LENGTH)),
                );

                if (!isDuplicate) {
                  await db.from("company_knowledge").insert({
                    company_id: companyId,
                    category: learning.category,
                    insight: learning.insight,
                    tags: learning.tags,
                    source_type: learning.source_type,
                    source_lead_id: leadId,
                    metadata: {
                      event,
                      lead_score: lead.ai_score,
                      lead_stage: lead.pipeline_stage,
                    },
                  });
                  extractedCount++;
                }
              }
            }

            // ── Style calibration (throttled - skip if we already have enough) ──
            const { count: styleCount } = await db
              .from("company_knowledge")
              .select("id", { count: "exact", head: true })
              .eq("company_id", companyId)
              .eq("category", "style_preference")
              .eq("is_active", true);

            if ((styleCount ?? 0) < MAX_STYLE_LEARNINGS) {
              const styleLearnings = await extractStyleCalibration(
                openaiKey,
                smsHistory,
                event,
              );
              const { data: existingForStyle } = await db
                .from("company_knowledge")
                .select("insight")
                .eq("company_id", companyId)
                .eq("is_active", true)
                .order("created_at", { ascending: false })
                .limit(50);

              const existingStyleInsights = (existingForStyle || []).map((e) =>
                (e.insight as string).toLowerCase().trim(),
              );

              for (const sl of styleLearnings) {
                const normalised = sl.insight.toLowerCase().trim();
                const isDuplicate = existingStyleInsights.some(
                  (e) =>
                    e === normalised ||
                    (e.length > DEDUP_PREFIX_LENGTH &&
                      normalised.length > DEDUP_PREFIX_LENGTH &&
                      e.substring(0, DEDUP_PREFIX_LENGTH) === normalised.substring(0, DEDUP_PREFIX_LENGTH)),
                );
                if (!isDuplicate) {
                  await db.from("company_knowledge").insert({
                    company_id: companyId,
                    category: sl.category,
                    insight: sl.insight,
                    tags: sl.tags,
                    source_type: sl.source_type,
                    source_lead_id: leadId,
                    metadata: { event, type: "style_calibration" },
                  });
                  extractedCount++;
                }
              }
            } else {
              console.log(
                `Company ${companyId} already has ${styleCount} style learnings - skipping style calibration`,
              );
            }
          }
        } else {
          console.warn("No OpenAI key available for knowledge extraction");
        }
      }
    }

    // ── Recompute performance stats (throttled - max once per hour) ──────────
    try {
      const throttleCutoff = new Date(
        Date.now() - STATS_THROTTLE_MINUTES * 60 * 1000,
      ).toISOString();

      const { data: recentStats } = await db
        .from("ai_performance_stats")
        .select("computed_at")
        .eq("company_id", companyId)
        .eq("period", "all_time")
        .gte("computed_at", throttleCutoff)
        .maybeSingle();

      if (!recentStats) {
        await computePerformanceStats(db, companyId);
      } else {
        console.log(
          `Stats for ${companyId} computed recently (${recentStats.computed_at}) - skipping recomputation`,
        );
      }
    } catch (statsErr) {
      console.error("Performance stats computation failed:", statsErr);
    }

    // ── Update cross-company industry insights ──────────────────────────────
    try {
      await updateIndustryInsights(db, companyId);
    } catch (industryErr) {
      console.error("Industry insights update failed:", industryErr);
    }

    // ── Log the learning event ──────────────────────────────────────────────
    await db.from("activity_log").insert({
      company_id: companyId,
      action: "ai.knowledge_extracted",
      entity_type: "lead",
      entity_id: leadId || companyId,
      details: {
        event,
        learnings_extracted: extractedCount,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        learnings_extracted: extractedCount,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("ai-learner error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
