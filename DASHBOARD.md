# Lead Gen Rentals - Client Dashboard

The client-facing platform: clients log in here to see their leads, watch their
guarantee track, run the AI SMS agent, send quotes and manage their account.

The Lead Gen Rentals client platform. It
lives inside this repo rather than a separate one, served from the same domain:

```
leadgenrentals.com.au/            marketing site
leadgenrentals.com.au/mc/         Mission Control (admin)
leadgenrentals.com.au/dashboard/  this - the client platform
```

It uses the **same Supabase project** as the rest of LGR
, already wired up in the pages below - no extra config.

Self-contained: its own Supabase project, Stripe account and Twilio account.
No runtime dependency on any other system.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | login / signup |
| `index.html` + `dashboard-supabase.js` | the main client app |
| `admin.html` | internal admin panel |
| `quote-public.html` | public quote view |
| `privacy.html`, `terms.html` | legal |
| `lib/supabase.js` | shared Supabase client |

Edge functions and migrations live with the rest of the project in
`../supabase/` - they were merged in, not kept separate.

## Before it works

1. **Run the migrations.** The platform's 90 migrations live in
   `../supabase/migrations/` (the `2026051*`-`2026072*` set). They create ~50
   tables: companies, profiles, leads, conversations, area_orders,
   lead_disputes, sms_credits and the rest. None collide with the LGR rental
   tables - the one clash, `leads`, was resolved by renaming LGR's to
   `asset_leads`. (Already applied to the live project.)

2. **Deploy the edge functions** in `../supabase/functions/`. Stripe has one
   endpoint, `stripe-webhook`, for engine checkouts and SMS credit purchases.

3. **Set the function secrets** on the LGR Supabase project:
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `VERIPHONE_API_KEY` (used inline by `submit-lead`).

## Notes

- Auto-deploy of edge functions via GitHub Actions is **not** enabled. The
  ported workflow was removed; deploy from the Supabase dashboard or CLI.
- Email copy inside the functions still reads as generic platform text - worth
  a pass for LGR tone before go-live.
- **Engine leads are mirrored into the platform** by
  `sync_asset_lead_to_company()` (migration `20260916000200`), called by
  `deliver-lead`. This is not optional plumbing: the guarantee is measured in
  quotes, `quotes.lead_id` points at `public.leads`, and an engine lead that
  never reaches that table can never count toward it. A delivered engine lead
  with a null `mirrored_lead_id` means an installer with no linked company, and
  that engagement's guarantee is unmeasurable until it is linked.
- The dispute/scrub round trip from the old `sync-to-hq` / `sync-from-mc` pair
  is still unported. Since both sides share one database, most of it could be
  done in SQL.
- **Retired in October 2026**, as leftovers of the self-serve platform the
  dashboard was ported from: the public REST API and its Cloudflare worker,
  API keys, outbound webhooks, Google review requests, the VA console, and
  the unused phone-check / callback intake functions. `va-api` became
  `admin-api` (admin only) since `admin.html` still needs its billing, DFY and
  email-template actions. Their tables were dropped in `20261009000100`.
- **Password resets** go through `send-password-rest`: a branded Resend email
  whose recovery link lands on `SITE_URL/` (default
  `https://leadgenrentals.com.au/dashboard`), where `PASSWORD_RECOVERY` opens
  the reset modal. That URL must be in Supabase Auth's redirect allow list.
- **SMS credit top-ups**: the Buy buttons on the AI Agent page call
  `create-sms-credits-checkout`; Stripe's `checkout.session.completed` then
  hits `stripe-webhook` (the only Stripe endpoint), which adds the credits.
