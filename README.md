# Lead Gen Rentals

Marketing site, client dashboard and Mission Control for Lead Gen Rentals,
served from one domain:

```
leadgenrentals.com.au/            marketing site
leadgenrentals.com.au/fleet.html  pricing, guarantee and availability
leadgenrentals.com.au/dashboard/  the client platform
leadgenrentals.com.au/mc/         Mission Control (internal admin)
```

## Read MODEL.md first

[`MODEL.md`](MODEL.md) describes how the product actually works: what we own,
what the client pays us, what they pay Meta, and what we guarantee. Marketing
copy, the legal terms and the schema all have to agree with it. **If a change
disagrees with that file, one of the two is wrong.**

The short version: we own the lead engine and the Meta ad account. The client
pays us a fixed monthly fee, and pays Meta directly from their own card for
their own ad budget. We guarantee 10 quotes and $100,000 of quoted pipeline per
30 day cycle, and refund the fee in full if we miss it.

Two rules follow from that and are easy to break by accident:

- **A fee never appears without the ad budget beside it.** A fee on its own
  reads as the total cost of advertising with us, and it is not.
- **Exclusivity is per engine, never per area.** No copy, quote, email or
  contract may offer a territory, a postcode or a region.

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
