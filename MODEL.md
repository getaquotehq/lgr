# The Lead Gen Rentals model

Reference for how the product actually works. Marketing copy, legal terms and
the schema all have to agree with this document. If a change disagrees with
this file, one of the two is wrong.

## 1. Shared engines, lead-level exclusivity

An **engine** is a landing page for one trade and area plus the paid campaigns
behind it, run and funded on LGR's own ad accounts.

Engines are **shared**. Several service businesses rent slots on the same
engine at the same time. Renting a slot conveys:

- no exclusivity over an area, postcode, region, or the engine itself
- no right to prevent LGR renting the remaining slots to competitors

What is exclusive is the **lead**. Exclusivity is enforced at the moment of
capture by named consent (§2), not by geography.

## 2. Named consent, and how a visitor is assigned

Before the enquiry form is rendered, the engine picks exactly one renter and
writes that renter's business name into the consent line. The homeowner
consents to be contacted by **that business, by name**. The resulting lead is
delivered to that business alone.

### 2.1 Assignment is sticky per person, forever

**Once a person is assigned to a renter, they are never reassigned.** Every
later visit and every later submission by that person - on the same engine or
any other LGR engine - stays bound to the renter they were first assigned to.

This is the rule that makes shared engines safe. Two renters can never be
given the same homeowner, and a homeowner is never contacted by two LGR
renters about the same enquiry.

### 2.2 Identity resolution order

A person is identified by the strongest signal available, in this order:

1. **Phone number** (normalised to E.164) - strongest, since it is the
   delivered contact field and is carrier-validated at capture.
2. **Email address** (lowercased, trimmed).
3. **Device/browser identifier** - a first-party cookie plus a fallback
   fingerprint, used only before a person has given contact details.

A visitor with no prior record is assigned at first render and the assignment
is written against whichever identifiers are known at that moment. When a
previously anonymous visitor later submits contact details, the
device-scoped assignment is upgraded to a phone/email-scoped one. Where two
records turn out to be the same person (same phone arriving under a different
device), the **earliest** assignment wins and the later record is merged into
it. Earliest-wins is what makes the rule deterministic under races.

### 2.3 Choosing a renter for a genuinely new person

Only new people get chosen for. The selection is over the renters with an
active, paid, non-cancelled slot on that engine, and should equalise assigned
volume across slots over time rather than strictly alternate. Weighted
least-assigned (pick the active slot with the fewest assignments in the
current period, ties broken at random) is the intended policy.

Note the consequence for capacity: the slot cap exists precisely because this
divides a finite stream of visitors. More slots means fewer assignments per
slot. Raising a cap dilutes every existing renter, which is why caps are hard.

### 2.4 Duplicate submissions

Where the same person submits again within 30 days, the later submission is a
duplicate of the first. It is delivered to the same renter or not at all. It
is never delivered to a different business.

## 3. Tiers are service levels

`starter` / `growth` / `scale` describe how much campaign weight sits behind a
slot. They are **not**:

- a lead count
- a floor or minimum
- a commitment to spend any stated or auditable amount

Never publish a specific deployed-spend figure, in copy or in terms. LGR runs
the campaigns as it sees fit.

## 4. What is guaranteed, and what is not

**Guaranteed** (things fully within LGR's control):

- every lead named to a renter is delivered to that renter and no other
- assignment of a person to a renter is permanent (§2.1)
- the engine runs for each period the renter has paid for

**Not guaranteed, anywhere, on any tier:**

- any number of leads, or any minimum
- any cost per lead
- any outcome - that a lead answers, quotes or converts

There is **no floor, no volume refund, no guarantee tier and no trial**. If
advertising costs rise, the renter receives fewer leads that period. That is
the renter's variance, not LGR's. Do not reintroduce a guarantee to make the
offer feel stronger; it is deliberately absent.

## 5. Risk posture

**LGR's risk is zero by construction.** Billing is prepaid via Stripe - no
period runs that has not been paid for - and nothing promises an outcome.

**The renter's perceived risk is carried entirely by soft levers**, never by a
guarantee:

- month to month, no lock-in, no exit fee, self-serve cancel that frees the slot
- "the engine is shared, but named consent means your lead is yours alone"
- transparent published pricing per trade and area, no "contact us" dead ends
- preview-before-pay: the *form* a homeowner fills in, with the prospect's own
  business name filled into the consent line live at checkout, before a card is
  charged. Never the engine's page, brand name or domain - see §6.
- a dashboard showing campaign activity alongside leads delivered, so a thin
  period visibly shows LGR did what it promised without LGR having promised a
  number

## 6. Engine identity is not public

An engine's **identity** - its brand name, its domain and the live page itself -
is disclosed to a renter when their slot is paid for, and to nobody else. What
is public is the **catalogue**: trade, area, tier, price, availability.

The reason is asymmetry. A prospect gains nothing from the domain that the area,
trade, level, price and the consent-line preview do not already give them. An
adversary gains everything: with the URL a competitor or an ex-renter can fill a
funnel we fund the ads for with rubbish, mass-report the ads to the platform, or
clone it outright. Anti-spam measures raise the cost of each junk submission;
they do nothing about a report or a clone, and nothing about the fact that the
target was published. So the identity is withheld and the trust levers in §5 -
named consent shown live at checkout, published pricing, month-to-month, the
dashboard - carry the risk instead. None of them require naming the engine.

Enforced in the database, not the markup:

- `public.assets_public` is the catalogue view (trade, area, tier, price,
  availability). It is what `anon` reads, and it has no identity columns.
- `anon` has no SELECT on `public.assets` at all.
- `authenticated` reads a full asset row only through the
  `renter reads own engines` policy: an asset they hold a live `rentals` row
  against. A free dashboard account with no rental sees exactly what anon sees.
- Super admins are unaffected; Mission Control reads and writes the base table.

The consequence for copy: nothing anywhere may promise a prospect that they will
see the page, the brand or the URL before paying. "You see your name on the
consent line before you pay" is true and is the promise to make. "You see the
engine before you pay" is not.

## 7. Implementation status

Phase 1 (copy, positioning, legal) is done. The following are **specified here
but not yet built** - see the Phase 2 notes in the handover:

- `assets` has no slot-capacity columns; it still models one renter per asset
  (`assets.rented_by`, `status available|rented`). `fleet.html:slotLabel()`
  deliberately renders a qualitative label rather than inventing a count.
- No assignment table exists. §2 is not implemented in the lead-capture flow.
- ~~`assets.floor_leads` / `rentals.floor_leads` still exist~~ **Done.** The
  floor columns are dropped from `assets`, `rentals` and `rental_checkouts`;
  `activate_rental` no longer copies a floor onto the rental; `set_area_pricing`
  lost its `p_floor` argument; and `area_pricing_overview` no longer computes
  `worst_case_per_lead`. Mission Control's below-floor alerting, pace table and
  "outstanding to floor" tracking are gone with them. Tiers were left exactly as
  they were - `assets_tier_check` is still a plain starter/growth/scale enum.
