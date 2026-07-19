# Lead Gen Rentals

A lead-gen rental marketplace. Installers rent **assets** (pre-built lead
funnels) per **niche** (trade) and **region**, on a flat monthly fee. Every
lead an asset produces goes to a single installer — never shared, never resold.

The site is **static HTML + inline JavaScript** (no framework) served from
GitHub Pages, backed by **Supabase** (Postgres + RLS + RPC).

| Page | Purpose | Data |
| --- | --- | --- |
| `index.html` (`/`) | Generic homepage + trade picker | `niches` |
| `solar-leads.html` (`/solar-leads`) | Solar niche landing page + availability counter | `assets` / `regions` |
| `fleet.html` (`/fleet.html`) | Installer-facing inventory of solar assets | `assets` + `regions` + `niches` |

## Architecture

- **Frontend:** plain HTML/CSS/JS. The Supabase JS client (`@supabase/supabase-js` v2)
  is loaded from a CDN and configured via `supabase-config.js`.
- **Backend:** Supabase project `lgr` (`tgujjtllrrhpwkcmmqap`).
- **Security:** Row Level Security on every table. The browser uses the **anon**
  (publishable) key and can only read public catalog data (`niches`, `regions`,
  `assets`) and call the `insert_lead()` function. Everything else is
  service-role only.

### Database schema (`supabase/migrations/`)

| Table | What it holds |
| --- | --- |
| `niches` | Trade categories (solar, hvac, roofing, renovations) + status |
| `regions` | Geographic areas assets operate in |
| `assets` | The rentable funnels — tier, price, floor, current rental status |
| `installers` | The buyers (private) |
| `leads` | Captured form submissions (private) |
| `rentals` | Rental contract history (private) |

Migrations, in order:

1. `20260719120000_schema.sql` — tables + indexes
2. `20260719120100_rls_and_functions.sql` — RLS policies + `insert_lead()` RPC
3. `20260719120200_seed.sql` — niches, 4 regions, 2 installers, 9 solar assets

### Lead capture & de-duplication

Consumer funnels (the asset landing pages, not in this repo) capture leads by
calling the `insert_lead()` RPC — never by writing to the `leads` table directly:

```js
const { data, error } = await sb.rpc('insert_lead', {
  p_asset_id: '<asset uuid>',
  p_full_name: 'Jane Homeowner',
  p_phone: '0400 000 000',
  p_email: 'jane@example.com',   // optional
  p_postcode: '4000',            // optional
  p_extra: { quarterly_bill: 450, timeline: '1-3 months' } // optional
});
```

The installer is resolved from the asset's current renter (`assets.rented_by`).

**Dedup rule (strict):** a lead is marked `status='duplicate'`,
`is_duplicate=true` (and does **not** count toward the floor) only when the same
**phone** was already captured on the **same asset**, while rented to the **same
installer**, within the **last 30 days** — i.e. a real double-submit. A different
asset, or the same asset rented to a different installer, **never** dedups, even
with an identical phone number. Non-duplicates fire a `pg_notify('lead_delivered', …)`
hook (stub for the SMS/email/CRM delivery workflow).

### Row Level Security summary

| Table | anon (browser) | service role |
| --- | --- | --- |
| `niches`, `regions`, `assets` | read-only (`select`) | full |
| `installers`, `leads`, `rentals` | **no access** | full |
| `insert_lead()` RPC | `execute` (only way to write a lead) | `execute` |

## Frontend configuration

Public client values live in `supabase-config.js`:

```js
window.LGR_SUPABASE = {
  url:     "https://tgujjtllrrhpwkcmmqap.supabase.co",
  anonKey: "<publishable anon key>"
};
```

Both are safe to ship in the browser (RLS enforces access). **Never** put the
`service_role` key here or anywhere client-side.

Each page fails gracefully: while a query is in flight it shows a skeleton/loading
state, and if Supabase is unreachable it shows *"Availability data temporarily
unavailable"* instead of a blank page.

## Local development

Prerequisites: [Docker](https://docs.docker.com/get-docker/), the
[Supabase CLI](https://supabase.com/docs/guides/local-development), and any static
file server (e.g. Python).

```bash
# 1. Start the local Supabase stack (Postgres, Auth, PostgREST, Studio…)
supabase start

# 2. Apply all migrations + seed into the local database
supabase db reset            # runs everything in supabase/migrations/ in order

# 3. Point the frontend at your LOCAL project
#    `supabase start` prints the local API URL and anon key — paste them into
#    supabase-config.js (or keep a local copy):
#      url:     http://127.0.0.1:54321
#      anonKey: <local anon key from `supabase start`>

# 4. Serve the static site. NOTE: use clean URLs so `/solar-leads` resolves.
python3 -m http.server 8080
#   → http://localhost:8080/index.html
#   (GitHub Pages resolves /solar-leads to solar-leads.html automatically;
#    with http.server, open /solar-leads.html and /fleet.html directly.)
```

Open Supabase Studio at the URL `supabase start` prints to inspect tables and
run `select * from leads;` etc.

## Deploying

**Database** — two options:

- **Supabase GitHub integration** (already installed on the repo): pushing
  changes under `supabase/migrations/` to the default branch deploys them to the
  linked project automatically.
- **Manual:** `supabase link --project-ref tgujjtllrrhpwkcmmqap && supabase db push`.

**Frontend** — GitHub Pages serves the repo root. Ensure `supabase-config.js`
holds the **production** URL + anon key, commit, and push. The custom domain is
configured via `CNAME`.

## What's stubbed (build later)

- `/api/rent-asset` — the fleet page's "Rent this asset" button POSTs here; wire
  it to a checkout / territory-lock flow (e.g. a Supabase Edge Function using the
  service role to write `rentals` + flip `assets.status`).
- Lead **delivery** (SMS / email / CRM push) — `insert_lead()` emits a
  `lead_delivered` notification; attach a worker/Edge Function to fan it out.
