// ============================================================================
// trial-upsell-check: the only thing that turns a 5-lead trial into ongoing
// revenue now that trials don't auto-roll into a subscription. Runs daily
// via pg_cron (see migration 20260730120000_trial_upsell_scheduling.sql),
// finds trials in their day 5-9 window that haven't been touched yet, and
// fires a real, scheduled touchpoint per trial - not something anyone has
// to remember to do manually:
//   - an email to the renter, referencing how many of their 5 leads have
//     actually landed so far
//   - an SMS nudge to the same effect
//   - an internal notice to contact@leadgenrentals.com.au so a human
//     actively calls, rather than just waiting on the renter to reply
// Idempotent: stamps rentals.trial_upsell_sent_at so a trial is only ever
// touched once, even if the cron fires more than once in the window.
//
// Auth: header "x-cron-secret: <TRIAL_UPSELL_CRON_SECRET>" - called only by
// the pg_cron job, never public.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected),
//          TRIAL_UPSELL_CRON_SECRET,
//          RESEND_API_KEY, RESEND_FROM_EMAIL,
//          TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
// ============================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !fromEmail) {
    console.warn("trial-upsell-check: RESEND_* not configured, skipping email to", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Lead Gen Rentals <${fromEmail}>`,
      to: [to],
      reply_to: replyTo || "contact@leadgenrentals.com.au",
      subject,
      html,
    }),
  });
  if (!res.ok) console.error("trial-upsell-check: resend error:", res.status, (await res.text()).slice(0, 300));
}

async function sendSms(to: string, body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM_NUMBER");
  if (!sid || !token || !from) {
    console.warn("trial-upsell-check: TWILIO_* not configured, skipping SMS to", to);
    return;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(sid + ":" + token), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
  });
  if (!res.ok) console.error("trial-upsell-check: twilio error:", res.status, (await res.text()).slice(0, 300));
}

Deno.serve(async (req) => {
  const expectedSecret = Deno.env.get("TRIAL_UPSELL_CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!expectedSecret || !providedSecret || providedSecret !== expectedSecret) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 9 * 86400000).toISOString(); // started_at >= 9 days ago
    const windowEnd = new Date(now.getTime() - 5 * 86400000).toISOString();   // started_at <= 5 days ago

    const { data: rentals, error: rentalsErr } = await db
      .from("rentals")
      .select("id, asset_id, installer_id, started_at, floor_leads, monthly_price_aud")
      .eq("is_trial", true)
      .is("ended_at", null)
      .is("trial_upsell_sent_at", null)
      .gte("started_at", windowStart)
      .lte("started_at", windowEnd);

    if (rentalsErr) throw rentalsErr;
    if (!rentals || rentals.length === 0) {
      return json({ success: true, checked: 0, touched: 0 });
    }

    let touched = 0;
    for (const rental of rentals) {
      try {
        const [{ data: installer }, { data: asset }, { count: deliveredCount }] = await Promise.all([
          db.from("installers").select("business_name, contact_name, email, phone").eq("id", rental.installer_id).maybeSingle(),
          db.from("assets").select("brand_name, niches(name), regions(name)").eq("id", rental.asset_id).maybeSingle(),
          db.from("asset_leads").select("id", { count: "exact", head: true })
            .eq("asset_id", rental.asset_id).eq("installer_id", rental.installer_id)
            .eq("status", "delivered").gte("captured_at", rental.started_at),
        ]);

        if (!installer?.email) continue;

        const delivered = deliveredCount || 0;
        const brandName = (asset as any)?.brand_name || "your lead engine";
        const nicheName = (asset as any)?.niches?.name || "lead";
        const regionName = (asset as any)?.regions?.name || "";
        const firstName = (installer.contact_name || "").trim().split(/\s+/)[0] || "there";
        const money = (n: number) => "$" + Number(n).toLocaleString("en-AU");

        const progressLine = delivered >= 5
          ? `All 5 of your trial leads have landed.`
          : delivered > 0
          ? `${delivered} of your 5 trial leads have landed so far.`
          : `Your trial leads are still coming in.`;

        const emailHtml = `
          <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0D1117">
            <h2 style="font-size:20px;letter-spacing:-.02em;margin:0 0 6px">How's the trial going, ${esc(firstName)}?</h2>
            <p style="font-size:15px;line-height:1.55;color:#3A424D;margin:0 0 18px">
              ${esc(progressLine)} If ${esc(brandName)}${regionName ? " in " + esc(regionName) : ""} is worth keeping switched on,
              the monthly plan for this engine is ${money(rental.monthly_price_aud)} + GST / 30 days, floor of ${rental.floor_leads} ${esc(nicheName)} leads.
              Nothing continues automatically from the trial - just reply to this email or call us and we'll get it set up.
            </p>
            <p style="font-size:13px;line-height:1.55;color:#656D76;margin:18px 0 0">
              Questions first? Just reply - happy to talk it through.
            </p>
            <p style="font-size:12px;color:#98A0A8;margin:22px 0 0">Lead Gen Rentals - leadgenrentals.com.au</p>
          </div>`;

        await sendEmail(installer.email, `How's the trial going, ${firstName}?`, emailHtml).catch((e) =>
          console.error("trial-upsell-check: email failed (non-fatal):", e));

        if (installer.phone) {
          await sendSms(
            installer.phone,
            `Lead Gen Rentals: ${progressLine} Want to keep ${brandName} running? Reply here or check your email to get the monthly plan switched on.`,
          ).catch((e) => console.error("trial-upsell-check: sms failed (non-fatal):", e));
        }

        await sendEmail(
          "contact@leadgenrentals.com.au",
          `Trial upsell call needed - ${installer.business_name || brandName}`,
          `<h2 style="margin:0 0 14px;font-family:Arial,sans-serif">Trial upsell call needed</h2>
           <table style="border-collapse:collapse;font-size:14px;font-family:Arial,sans-serif">
             <tr><td style="padding:4px 14px 4px 0;color:#656D76">Business</td><td><strong>${esc(installer.business_name || "")}</strong></td></tr>
             <tr><td style="padding:4px 14px 4px 0;color:#656D76">Contact</td><td><strong>${esc(installer.contact_name || "-")}</strong></td></tr>
             <tr><td style="padding:4px 14px 4px 0;color:#656D76">Email</td><td><a href="mailto:${esc(installer.email)}">${esc(installer.email)}</a></td></tr>
             <tr><td style="padding:4px 14px 4px 0;color:#656D76">Phone</td><td><strong>${esc(installer.phone || "-")}</strong></td></tr>
             <tr><td style="padding:4px 14px 4px 0;color:#656D76">Asset</td><td><strong>${esc(brandName)}</strong></td></tr>
             <tr><td style="padding:4px 14px 4px 0;color:#656D76">Leads delivered</td><td><strong>${delivered} / 5</strong></td></tr>
             <tr><td style="padding:4px 14px 4px 0;color:#656D76">Would-be plan</td><td><strong>${money(rental.monthly_price_aud)} / mo, floor ${rental.floor_leads}</strong></td></tr>
           </table>
           <p style="margin:16px 0 0;font-size:12px;color:#888;font-family:Arial,sans-serif">Renter has also been emailed/texted automatically. This is the trigger to call them.</p>`,
          installer.email,
        ).catch((e) => console.error("trial-upsell-check: internal notice failed (non-fatal):", e));

        const { error: stampErr } = await db
          .from("rentals")
          .update({ trial_upsell_sent_at: new Date().toISOString() })
          .eq("id", rental.id);
        if (stampErr) console.error("trial-upsell-check: failed to stamp trial_upsell_sent_at:", stampErr);

        touched++;
      } catch (e) {
        console.error("trial-upsell-check: failed for rental", rental.id, e);
      }
    }

    return json({ success: true, checked: rentals.length, touched });
  } catch (err) {
    console.error("trial-upsell-check error:", err);
    return json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
