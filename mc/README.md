# lgr-mc — Lead Gen Rentals Mission Control

A standalone admin panel for **Lead Gen Rentals**, modelled on the `ql-mc`
(QuoteLeads) mission-control panel. Same stack, same conventions, **separate
app / separate deployment / separate auth** — it shares nothing with `ql-mc`.

- **Stack:** a single static HTML file (`app.html`) with inline CSS + vanilla
  JS. No framework, no build step. The Supabase JS client (`@supabase/supabase-js`
  v2) and Chart.js load from a CDN, exactly like `ql-mc`.
- **Backend:** the LGR Supabase project (`tgujjtllrrhpwkcmmqap`) — a **different
  project** from `ql-mc`, so there is zero data or auth overlap.
- **Auth:** its own Supabase Auth. Admin operators sign in with email/password;
  Row Level Security grants the `authenticated` role full CRUD. The public
  website keeps using the `anon` key and is unaffected.

> The entry file is **`app.html`**, not `index.html` — `index.html` is the
> public website's home page and must not be shadowed.

## Features

| Panel | What it does |
| --- | --- |
| **Dashboard** | Active rentals, leads delivered this month, **assets below floor pace** (early-warning), available assets per niche, 14-day leads chart. |
| **Assets** | Full CRUD. Filter by niche/region/tier/status, search brand/domain, sortable columns. Tier dropdown auto-fills price + floor (Starter $1,200/10, Growth $2,400/20, Scale $3,600/30, overridable). Row quick-actions: mark status, duplicate, **soft-delete** (`deleted_at`, never a hard delete). |
| **Rentals** | Rental history with installer/asset/active-ended filters. **End rental** stamps `ended_at` and returns the asset to `available`. |
| **Installers** | Full CRUD. Expand a row to see the assets they currently rent. |
| **Leads** (read-only) | Delivery log with asset/installer/status/date-range filters, **CSV export**, and **per-installer 30-day-cycle counts** for floor tracking. |
| **Niches / Regions** | Catalog CRUD (slug, name, status, sort order). |

### Floor-pace early warning

For each rented asset the dashboard projects the cycle:

```
projected = leads_so_far / days_into_cycle × 30
```

The 30-day cycle is `[rented_until − 30d, rented_until]`. An asset is flagged
when `projected < floor_leads`. A red badge in the top bar shows the flag count.

## Database

Migrations live in the repo root at `../supabase/migrations/`. This panel adds
one migration:

- `20260719130000_admin_panel.sql`
  - `assets.deleted_at` (soft delete) + index; the public catalog policy is
    updated to hide soft-deleted assets.
  - Admin RLS: the `authenticated` role gets full CRUD on every table
    (`niches, regions, assets, installers, leads, rentals`).

Apply it with the Supabase CLI (`supabase db push`) or the dashboard SQL editor.

## Configuration

Public client values live in `supabase-config.js` (safe to ship — RLS enforces
access):

```js
window.LGR_MC_SUPABASE = {
  url:     "https://tgujjtllrrhpwkcmmqap.supabase.co",
  anonKey: "<publishable anon key>"
};
```

### Env vars / deployment injection

The requested env vars map onto this static app as follows:

| Env var | Where it's used | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | `supabase-config.js → url` | Public, safe in the browser. |
| `SUPABASE_ANON_KEY` | `supabase-config.js → anonKey` | Public, safe in the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | **server/CLI only** | **Never shipped to the browser.** Used only for migrations / server-side jobs. |

> ⚠️ **The service_role key bypasses RLS and must never be placed in
> `supabase-config.js` or any client file.** The browser authenticates as a
> real admin user and gets its access through RLS — the same model `ql-mc`
> uses. If your host injects env vars at deploy time (Netlify/Vercel/etc.),
> write `SUPABASE_URL` and `SUPABASE_ANON_KEY` into `supabase-config.js` during
> the build; keep `SUPABASE_SERVICE_ROLE_KEY` in server-side secrets only.

### Creating admin users

Admins are provisioned manually (there is no public sign-up):

- **Supabase dashboard → Authentication → Users → Add user** (email + password,
  "Auto-confirm").

Any confirmed Supabase Auth user can sign in and gets full admin access. If
installer-facing auth is ever added, tighten the `to authenticated` RLS
policies in the migration to an explicit admin claim.

## Local dev

```bash
# from the repo root
python3 -m http.server 8080
# → http://localhost:8080/mc/app.html
```

Point `supabase-config.js` at a local Supabase stack if you want to develop
against `supabase start` instead of the live project.

## Deploying independently of ql-mc

`mc/` is fully self-contained — copy it to any static host (its own subdomain,
e.g. `mc.leadgenrentals.com.au`, its own Netlify/Vercel site, or a separate
GitHub Pages deployment). It has no shared code, build tooling, or auth with
`ql-mc` or with the public LGR site; the whole panel is just `app.html` +
`supabase-config.js` + `favicon.ico` in this folder.
