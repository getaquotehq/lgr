# Lead Gen Rentals HQ (lgr-hq)

The client-facing platform for Lead Gen Rentals: installers log in here to see
their leads, run the AI SMS agent, dispute bad leads, and manage their account.

Ported from `ql-hq`, which serves the same role for QuoteLeads. The two systems
are **completely separate** - separate Supabase projects, separate Stripe,
separate Twilio, separate domains. Nothing is shared at runtime.

```
lgr    (marketing site + Mission Control)  ->  Supabase project A
lgr-hq (this repo - client platform)       ->  Supabase project B   <- needs creating
```

This mirrors `ql-mc` <-> `ql-hq`.

---

## Status: not yet live

The code is ported and rebranded. It cannot run until a Supabase project exists
and the placeholders below are filled in.

### 1. Create the Supabase project

Create a new Supabase project for lgr-hq. **Do not point this at the `lgr`
project** - `lgr` already has its own `leads`, `installers` and
`lead_delivery_log` tables with different schemas, and they would collide.

### 2. Replace the placeholders

Two placeholder tokens are committed in place of credentials, so this repo can
never accidentally read another system's database. Replace both everywhere:

| Placeholder | Replace with |
| --- | --- |
| `__LGR_HQ_SUPABASE_URL__` | `https://<new-project-ref>.supabase.co` |
| `__LGR_HQ_ANON_KEY__` | the new project's anon/publishable key |

Files containing them:

```
admin.html
quote-public.html
va.html
dashboard-supabase.js
lib/supabase.js
supabase/functions/provision-twilio/index.ts
workers/api-proxy/wrangler.toml
```

Find them any time with:

```bash
grep -rl "__LGR_HQ_SUPABASE_URL__\|__LGR_HQ_ANON_KEY__" \
  --include=*.html --include=*.js --include=*.ts --include=*.toml .
```

### 3. Run the migrations

90 migrations in `supabase/migrations/`, in filename order. They define ~48
tables (companies, profiles, leads, conversations, ppl_orders, lead_disputes,
sms_credits, and the rest).

### 4. Deploy the edge functions

34 functions in `supabase/functions/`. Each needs its own secrets on the new
project - none are shared with ql-hq:

- `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` (a **separate** Stripe account, or
  at minimum a separate webhook endpoint)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (separate Twilio subaccount)
- `VERIPHONE_API_KEY`
- `LGR_MC_API_URL`, `LGR_MC_API_SECRET` - for the lgr <-> lgr-hq sync, if you
  wire up the equivalent of ql-mc's `sync-to-hq` / `sync-from-mc`

### 5. DNS

`CNAME` is set to `leadgenrentalshq.com`. Point that domain at this repo's
GitHub Pages, or change the CNAME if you'd rather use a different hostname.

---

## What was rebranded

- `QuoteLeadsHQ` -> `LeadGenRentalsHQ`, `QuoteLeads` -> `Lead Gen Rentals`
- `quoteleadshq.com` -> `leadgenrentalshq.com`
- `quoteleads.com.au` -> `leadgenrentals.com.au`
- `api.quoteleadshq.com` -> `api.leadgenrentalshq.com`
- Logo files renamed and replaced with the LGR marks; favicon replaced
- The protected system API key label `QUOTELEADS KEY` -> `LEADGENRENTALS KEY`

Application logic, schema and function behaviour are unchanged from ql-hq.

## Still to do

- The `workers/api-proxy` Cloudflare Worker needs its own deployment, and its
  `wrangler.toml` route/account updating (it currently carries ported config).
- Email copy inside the edge functions still reads as generic platform text;
  worth a pass for LGR tone before go-live.
- No lgr <-> lgr-hq sync functions exist yet. The QL equivalents (`sync-to-hq`,
  `sync-from-mc`, and the dispute/scrub round trip) would need porting into the
  `lgr` project and here if you want the same two-way lead-credit flow.
