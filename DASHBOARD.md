# Lead Gen Rentals - Client Dashboard

The installer-facing platform: renters log in here to see their leads, run the
AI SMS agent, dispute bad leads and manage their account.

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
| `va.html` | VA console |
| `quote-public.html` | public quote view |
| `api-docs.html` | API documentation |
| `privacy.html`, `terms.html` | legal |
| `lib/supabase.js` | shared Supabase client |
| `workers/api-proxy/` | Cloudflare Worker fronting the public API |

Edge functions and migrations live with the rest of the project in
`../supabase/` - they were merged in, not kept separate.

## Before it works

1. **Run the migrations.** The platform's 90 migrations live in
   `../supabase/migrations/` (the `2026051*`-`2026072*` set). They create ~50
   tables: companies, profiles, leads, conversations, area_orders,
   lead_disputes, sms_credits and the rest. None collide with the LGR rental
   tables - the one clash, `leads`, was resolved by renaming LGR's to
   `asset_leads`. (Already applied to the live project.)

2. **Deploy the edge functions** in `../supabase/functions/`. The platform's
   Stripe handler is **`dashboard-stripe-webhook`**, kept distinct from
   `stripe-webhook` so it doesn't overwrite the asset rental checkout.

3. **Set the function secrets** on the LGR Supabase project:
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `VERIPHONE_API_KEY`, and Stripe keys for the
   `dashboard-stripe-webhook` endpoint.

4. **Deploy the Worker** (optional) - `workers/api-proxy` needs its own
   Cloudflare deployment and its `wrangler.toml` route updating if you want the
   public API proxy.

## Notes

- Auto-deploy of edge functions via GitHub Actions is **not** enabled. The
  ported workflow was removed; deploy from the Supabase dashboard or CLI.
- Email copy inside the functions still reads as generic platform text - worth
  a pass for LGR tone before go-live.
- There is no lgr <-> dashboard sync layer yet. The pieces
  (`sync-to-hq` / `sync-from-mc` and the dispute/scrub round trip) would need
  porting if you want the same two-way lead-credit flow. Since both sides now
  share one database, most of that could be done in SQL instead.
