# Lead Gen Rentals

Marketing site, client dashboard and Mission Control for Lead Gen Rentals,
served from one domain:

```
leadgenrentals.com.au/            marketing site
leadgenrentals.com.au/fleet.html  pricing, guarantee and availability
leadgenrentals.com.au/dashboard/  the client platform
leadgenrentals.com.au/mc/         Mission Control (internal admin)
```

## Layout

| Path | What it is |
| --- | --- |
| `*.html` | the marketing site |
| `fleet.html` | pricing, the guarantee, availability and checkout |
| `dashboard/` | the client platform, see [`DASHBOARD.md`](DASHBOARD.md) |
| `mc/` | Mission Control: engines, engagements, the ad account handover and guarantee settlement |
| `supabase/migrations/` | schema, in order |
| `supabase/functions/` | edge functions |

## Deploying

Static hosting from the repo root. Migrations and edge functions are applied
from the Supabase dashboard or CLI; auto-deploy is not enabled.
