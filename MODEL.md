# The Lead Gen Rentals model

Reference for how the product actually works. Marketing copy, legal terms and
the schema all have to agree with this document. If a change disagrees with
this file, one of the two is wrong.

> **This replaced the shared-slot rental model in September 2026.** The old
> model is described at the bottom (§10) so that anything still carrying its
> language can be recognised and removed. Nothing in §10 is current.

---

## 1. What LGR sells

LGR owns an **engine**: a lead funnel - brand, domain, landing page, forms,
tracking - and the Meta advertising system behind it. LGR built it, LGR runs
it, LGR keeps it.

A client buys two things and only two things:

1. **Exclusive use of one engine's output.** While their engagement is live, no
   other business is put on that engine. Every lead it produces is theirs.
2. **LGR running the campaigns on it** - targeting, creative, budget pacing,
   optimisation, and the platform the leads land in.

The client does not buy the engine. The brand, the domain, the page, the pixel
history, the ad account and the audiences stay with LGR when they leave. That
is the asset, and it is the reason this business exists rather than an agency.

### 1.1 Exclusivity is per engine

**One client per engine.** That is the whole exclusivity story and it is the
only one that may be told.

LGR does **not** sell territory, and no copy, quote, email or contract may
suggest it does. An engine is not a postcode, a suburb, a city or a state, and
renting one grants no right over any area. Two LGR engines may well be running
in the same place. What a client is promised is that *their* engine is theirs.

Regions exist in the schema because a funnel brand needs a page per area and
leads have to be routed to the right client. That is plumbing. It is not a
public axis, it is not in the catalogue, and it is not something a client
chooses from a dropdown. The client tells us the area they service; we put them
on an engine that covers it.

---

## 2. The money: two flows, deliberately separate

This is the part everything else hangs off. Get it wrong in copy and the whole
offer misrepresents itself.

### 2.1 The service fee - paid to LGR

A **fixed monthly fee**, prepaid by card, month to month.

| Tier | Fee (ex GST) | What it is |
| --- | --- | --- |
| Engine | **$1,250 / month** | The standard product. One engine, run by us, with the §3 guarantee. |
| Custom | **from $2,500 / month** | Scoped engagement - multiple engines, a higher budget, a bespoke guarantee. Quoted, not published as a self-serve price. |

The fee covers LGR's work and LGR's asset. **It contains no advertising
spend.** It is never described as "including ad spend", "ad spend inclusive",
"all in", or anything that could be read that way.

### 2.2 The media spend - paid to Meta

The client pays Meta **directly**. LGR never handles, holds, invoices, fronts
or marks up a cent of it.

Mechanically:

1. LGR grants the client access to the LGR-owned Meta ad account that runs
   their engine.
2. The client adds **their own payment card** as that ad account's payment
   method.
3. Meta charges that card for the campaigns. The client sees every charge in
   Meta's own billing, at Meta's own prices.

Access is granted at the narrowest Meta role that gives the client both:
(a) visibility of every campaign, every dollar and every result, and (b)
ownership of the payment method on the account. **The client does not get
campaign edit rights** - they can see everything and change nothing, which is
what stops a well-meaning edit breaking a guarantee we are carrying.

The **Engine** tier commits to a minimum of **$50 / day** ($1,500 per 30-day
cycle) on that card. Custom-tier budgets are agreed in scope.

### 2.3 Why it is built this way

- **Transparency without trust.** The client does not have to believe a spend
  report. They are looking at Meta's invoice for their own card.
- **No markup, and none to be accused of.** LGR earns a stated fee. There is no
  incentive to inflate a budget, and no way to.
- **Risk stays bounded.** LGR's exposure is its own fee plus the cost of
  delivering the guarantee - not a media budget it has fronted for someone
  else. A client who stops paying Meta stops their own ads, not our cash flow.
- **The asset compounds.** Every dollar the client spends runs through LGR's
  pixel, on LGR's domain, into LGR's audiences. The client gets the leads; LGR
  gets a better engine. Both are real and both are disclosed.

### 2.4 The rule that keeps it honest

Whenever a price appears anywhere - a page, an email, a Stripe line item, a
contract - the ad budget appears beside it. A fee without the budget next to it
reads as the total cost, and it is not.

---

## 3. The guarantee

### 3.1 Ten quoted jobs in thirty days

In each 30-day cycle LGR guarantees the client will get **10 quoted jobs** from
leads their engine produced. Fall short and **the fee for that cycle is refunded
in full**. No pro-rata, no credit note, no make-good month. The money goes back,
and the client keeps every lead, quote and job the cycle produced.

It applies to **every cycle**, not just the first. Our exposure is capped at one
month's fee at a time, and a guarantee that expires after the trial month is a
trial offer wearing a guarantee's clothes.

**There is no dollar figure in the guarantee.** A quoted-pipeline number is a
positioning line for one landing page (§9.1), never a term. Two targets means a
client who produced twelve quotes worth less than some figure gets settled as a
shortfall against a promise nobody made them, which is why
`guarantee_pipeline_aud` is retired rather than merely unused.

### 3.2 What counts as a quoted job

A **quoted job** is a lead the engine delivered for which the client has issued a
written quotation, recorded in the dashboard, or evidenced from the client's own
records where they quote elsewhere.

**And this is the part that matters:** our control over a lead ends the moment
that lead replies to the automated follow-up confirming they want a quote or an
appointment. Whether a written quote then goes out is the client's own sales
activity, and we neither control it nor should be judged on it. So:

> A lead that returns a **confirmation response** during the period counts as a
> quoted job, whether or not the client actually quoted it.

A confirmation response is a reply from a delivered lead to the automated
follow-up that affirmatively confirms interest in obtaining a quote or attending
an appointment, recorded in the dashboard. Where 10 or more are recorded in the
period, the guarantee is met and no refund is payable.

Counting is over **distinct leads**: a lead that both confirmed and was quoted is
one quoted job, not two.

### 3.3 The period

**Thirty consecutive days from the day the client's advertising first goes
live** - not from the day they paid. Onboarding time is ours to lose, not theirs.

**Any suspension of advertising does not extend or reset it.** Pausing is the
client's responsibility. Continuous funding is a condition (§3.4) rather than
something that stops the clock, because a clock that pauses whenever delivery
stops can be held open indefinitely.

### 3.4 The conditions

A refund is conditional on all of the following holding throughout the period.
They are short, they are all things the client controls, and every one of them
is stated on the offer page and in the terms rather than buried:

- advertising was funded continuously at or above the daily budget agreed at
  activation, paid by the client directly to Meta;
- the automated follow-up stayed enabled and the assigned number stayed
  connected;
- each delivered lead was contacted and worked by the client, recorded in the
  dashboard;
- no change was made to any campaign, creative, budget or targeting without our
  prior agreement.

### 3.5 Claims

A refund is **claimed, not automatic**. The client submits a claim in writing
within **7 days** of the period ending; we assess it against the platform record
and respond within **14 days**.

That is not a hurdle for its own sake - it is what makes the assessment a dated,
recorded decision against the evidence rather than an argument in an inbox. A
cycle that ends short and is never claimed settles as a shortfall with nothing
owed until a claim arrives. The 7-day deadline is ours to waive, and waiving it
should be a decision rather than an accident, so only a super admin can record a
late claim.

### 3.6 What is not guaranteed, on any tier

- any cost per lead, per quote or per job
- any number of leads
- that a quote is accepted, or that any revenue results
- any number above the guarantee
- anything at all on the Custom tier beyond what its own scope document says

Advertising spend is paid by the client to Meta and is **not ours to refund**
under any circumstance, including when we miss.

### 3.7 The rule that protects the product

A shortfall is closed by **spending more and selling better** - never by widening
the targeting past what the client services, loosening lead validation, or
counting something that is not a real confirmation or a real quote to a real
homeowner. Server-side validation runs before delivery and is not relaxed to
reach a number. A guarantee met with junk costs more than a refund.

## 4. How a client comes on

1. **They tell us their trade and the area they service.** Not a territory
   choice - an input, so we can allocate an engine that covers it.
2. **They pay the first fee.** Stripe, monthly subscription, card.
3. **We grant ad account access. They add their card.** This is the step the
   whole model turns on, so it is tracked as its own fulfilment state and
   nothing is called live until it is done.
4. **We build and launch.** Targeting set to their service area, creative and
   copy from the engine's existing library.
5. **Ads go live - the cycle clock starts here.** §3.2.
6. **Leads land in the dashboard**, named to them on the consent the homeowner
   agreed to, and the platform responds within about 60 seconds.

Cancellation is self-serve in the dashboard before the next cycle. On
cancellation the ad account access is removed, the client takes their card off
it, and the engine returns to inventory.

---

## 5. Lead exclusivity and named consent

Before the enquiry form is rendered, the engine writes the client's business
name into the consent line. The homeowner consents to be contacted by **that
business, by name**, and the lead is delivered to that business alone. It is
never resold and never shared.

With one client per engine this is mostly bookkeeping - there is nobody else on
the engine to confuse it with. It still matters for the case that crosses
engines.

### 5.1 Assignment is sticky per person, forever

**Once a person is assigned to a client, they are never reassigned.** Every
later visit and every later submission by that person - on the same engine or
any other LGR engine - stays bound to the client they were first assigned to.

This is what stops one homeowner reaching two LGR clients through two different
funnel brands. LGR runs several brands over the same areas, so without it a
single homeowner could genuinely be sold to two businesses. Closed by
`lead_assignments` (see §8).

### 5.2 Identity resolution order

A person is identified by the strongest signal available:

1. **Phone number** (normalised to E.164) - strongest, since it is the
   delivered contact field and is carrier-validated at capture.
2. **Email address** (lowercased, trimmed).
3. **Device/browser identifier** - first-party cookie plus fallback
   fingerprint, used only before contact details exist. *Not built.*

Where two records turn out to be the same person, the **earliest** assignment
wins and the later merges into it. Earliest-wins is what makes it deterministic
under races.

### 5.3 Duplicate submissions

The same person submitting again within 30 days is a duplicate of the first. It
goes to the same client or to nobody. It is never delivered to a different
business.

---

## 6. Risk posture

**LGR's downside is one month's fee per client per cycle, and the cost of the
work.** Billing is prepaid via Stripe; the guarantee remedy is a refund of that
same prepayment. There is no media spend on LGR's balance sheet to lose, and no
outcome promised beyond §3.

**The client's downside is one cycle of media spend**, which they can see the
whole of in Meta's billing, against a fee that comes back if we miss.

The soft levers that carry perceived risk:

- month to month, no lock-in, no exit fee, self-serve cancel
- the fee is refunded if the guarantee is missed - the strongest lever, and the
  reason the others do less work than they used to
- every advertising dollar visible in the client's own Meta account
- transparent published pricing, with the budget stated beside the fee
- preview-before-pay: the *form* a homeowner fills in, with the prospect's own
  business name in the consent line, live at checkout. Never the engine's page,
  brand or domain - see §7
- a dashboard showing campaign activity beside leads, quotes and pipeline, so
  guarantee progress is visible daily rather than argued about on day 30

---

## 7. Engine identity is not public

An engine's **identity** - brand name, domain, and the live page - is disclosed
to a client once they are paid up, and to nobody else. What is public is the
**catalogue**: trade, tier, fee, budget and whether anything is available.

The reason is asymmetry. A prospect gains nothing from the domain that the
trade, tier, price, guarantee and consent-line preview do not already give
them. An adversary gains everything: with the URL, a competitor or an ex-client
can pour junk into a funnel the client is paying to run, mass-report the ads,
or clone it outright. Anti-spam raises the cost of a junk submission; it does
nothing about a report or a clone.

Enforced in the database, not the markup:

- `public.assets_public` is the catalogue view - trade, tier, fee, budget,
  guarantee, availability. It is what `anon` reads and it has **no identity
  columns and no region columns**.
- `anon` has no SELECT on `public.assets` at all.
- `authenticated` reads a full asset row only through `renter reads own
  engines`: an asset they hold a live `rentals` row against. A free dashboard
  account with no engagement sees exactly what anon sees.
- Super admins are unaffected; Mission Control reads and writes the base table.

**The consequence for copy:** nothing may promise a prospect they will see the
page, the brand or the URL before paying. "You see your name on the consent
line before you pay" is true and is the promise to make. "You see the engine
before you pay" is not.

---

## 8. How this is implemented

### 8.1 Schema

| Thing | Where it lives |
| --- | --- |
| The engine | `assets` - `tier` is `engine` or `custom`, `monthly_price_aud` is the **fee only**, `min_daily_budget_aud` is what the client commits to Meta |
| The guarantee, per engine | `assets.guarantee_quotes`, `guarantee_pipeline_aud`, `guarantee_window_days` |
| The engagement | `rentals` - snapshots fee, budget and guarantee at checkout so repricing the engine never moves a live client's deal |
| Ad account handover | `rentals.meta_ad_account_id`, `access_granted_at`, `payment_method_added_at`, `ads_live_at`, `ads_paused_at` |
| The promise and the outcome | `guarantee_cycles` - one row per 30-day cycle, with what was required, what was delivered, and what remedy was paid |
| Public catalogue | `assets_public` - no identity, **no region** |
| Person → client binding | `lead_assignments` (§5.1) |

`assets.monthly_price_aud` is a **fee**, not a total. Do not reintroduce a
column or a label that implies otherwise, and do not resurrect `floor_leads` -
the guarantee is quotes and pipeline now, and two competing guarantee numbers
is how a business ends up honouring the wrong one.

### 8.2 The cycle

`guarantee_cycles` is opened `pending` at checkout with no dates. It starts when
`rentals.ads_live_at` is stamped, which is also what sets `starts_at` /
`ends_at`. `public.recalc_guarantee_cycle()` recomputes delivered quotes and
pipeline from the dashboard's own `quotes` table; `public.settle_guarantee_cycle()`
closes a finished cycle as `met` or `shortfall` and records the refund.

Measuring quotes requires engine leads to exist as dashboard leads, so
`deliver-lead` mirrors each delivered `asset_leads` row into `public.leads` via
`public.sync_asset_lead_to_company()`, tagged `source = 'lgr_engine'`. Without
that mirror the guarantee is unmeasurable, which is why it is not optional.

### 8.3 Not built

- the device/browser identifier in §5.2, and record merging. A person using
  both a different phone and a different email still reads as new.
- automatic Stripe refunds on settlement. `settle_guarantee_cycle` records the
  remedy as owed; issuing it is a person in Mission Control. Deliberate for
  now - the first refunds should be looked at by a human.

### 8.4 Live inventory

108 solar engines: three brands (AU Solar Quotes, Clear Solar Quotes, Premium
Solar Quotes) across all 36 regions, all on the Engine tier at $1,250 + $50/day.
105 are sellable; the three `australian-capital-territory` rows are held back
because that region duplicates Canberra's postcodes.

Brand no longer implies tier. It used to - starter/growth/scale mapped one to
one onto the three funnel brands - and that was a pricing ladder dressed as
inventory. Tier is now the service level; brand is which funnel a client sits
on, and the client never sees it anyway (§7).

Battery, HVAC, roofing and renovations have niches and price lists but **no
funnel site**, and `submit-lead` routes on `brand_domain`, so there are no
engines to sell and their pages stay coming-soon. Do not seed a niche whose
funnel does not exist - a listing with no page behind it takes money and
delivers nothing.

---

## 9. Copy rules, in one place

### 9.1 Where the guarantee may appear

**The guarantee is not site-wide copy.** As a marketing claim it appears on
`offer.html` - a noindexed landing page for paid traffic - and nowhere else.
Not the homepage, not the trade pages, not the pricing page's copy, and not in
the footer fine print of any page that does not make the claim.

The one exception is `fleet.html`, where the transaction completes: its legal
fine print carries the term because the client pays there, and a page that takes
money for an offer has to state it. That is disclosure, not a headline, and it
does not license putting the guarantee back into that page's copy.

The reason is that a standing public promise of a refund is read by every
competitor and every tyre kicker, not only the person who clicked the ad it was
written for. On the offer page it reaches someone who has already seen the pitch
and is one click from acting. Everywhere else it is a liability with no
corresponding lift.

The rest of the site sells the same product without it: exclusive leads, ad
spend paid straight to Meta, nothing resold. **If the guarantee starts appearing
on the homepage or the trade pages again, that is a regression.**

It still appears where it must: in the terms, on the Stripe line item, and in
the client's own dashboard. Those are a contract, a receipt and a logged-in
tracker - not marketing surfaces.

**The $100,000 figure is not part of the guarantee** (§3.1). It is an
illustration of what ten quoted jobs is typically worth, and it may appear on
`offer.html` only. It must never appear in the terms, in the schema, on a Stripe
line item, or anywhere a reader could take it for a number we are held to.

### 9.2 What may and may not be said

Things that are true and may be said:

- "We own the engine and run the ads. You pay us a fixed fee and pay Meta
  directly for the advertising."
- "Your engine is yours alone while you're on it."
- "Every advertising dollar is charged to your card by Meta. We never touch it."
- "You see your business name on the consent line before you pay."
- on `offer.html` only: "10 quoted jobs in 30 days, or your fee is refunded in
  full."

Things that are false, or true-but-forbidden, and may never be said:

- anything implying the fee includes advertising spend
- any territory, area, postcode, suburb or region exclusivity
- any promise that the prospect will see the engine, brand or domain before
  paying
- any guaranteed cost per lead, or any guaranteed outcome beyond §3.1
- any specific deployed-spend figure of LGR's own
- "guaranteed leads", "minimum leads", or a lead floor of any kind
- any guaranteed dollar figure of quoted pipeline, anywhere

---

## 10. What this replaced (historical - not current)

Until September 2026 LGR sold **slots on shared engines**: several service
businesses rented the same engine at once, LGR funded the advertising out of a
flat monthly rental of $1,100/$2,200/$3,300, tiers were named
starter/growth/scale and mapped to the three funnel brands, and the guarantee
was a **lead floor** - 10/20/30 leads per 30-day cycle, remedied by running the
engine on past the cycle unbilled rather than by a refund. A "typical range"
(10-14 / 20-28 / 30-42) was published beside the floor.

All of it is gone: the floor, the typical ranges, the three-tier ladder, the
slot-sharing, and LGR funding media. If you find that language anywhere, it is
a leftover, not a second product.
