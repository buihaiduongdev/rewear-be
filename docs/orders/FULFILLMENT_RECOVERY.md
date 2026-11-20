# Late COD handover and carrier recovery

This extends `COD_GHN_SANDBOX.md`. It implements the approved
`COD-HANDOVER-*`, `CALENDAR-*` and `COD-SHIPMENT-CANCEL-*` decisions. All API
paths below have the `/api` prefix. JWT and active-user checks apply throughout.

## Configure the operational calendar

Admin calls `POST /admin/fulfillment/calendar` with
`{year, closedDates: ["YYYY-MM-DD"], source}`. Supply the approved full annual
closure list, including compensatory days off, and its source. An empty list is
an explicit assertion that the year has no weekday closures, not a holiday
calendar supplied by Rewear. This code does not bundle an assumed Vietnam
holiday schedule. Configure the next year before a deadline can cross into it.

Business SLAs exclude the incident/receipt day, skip Saturday, Sunday and
configured closures, and expire at 17:00 Vietnam time (UTC+7). Stored deadlines
do not move when the calendar is later changed. Missing coverage sets
`calendarMissing` and leaves the deadline null; it never silently substitutes a
weekday-only calendar or releases inventory. Admin can still stop a late order.

## Late handover

The worker opens one persistent case after 48 continuous hours without verified
pickup. Booking or printing a label does not prove pickup. The original case
time and two-business-day Admin deadline remain stable on retries. During
review/proposal, booking and label issuance stay blocked; physical pickup can
still occur and is recorded separately.

| Actor | Endpoint | Body / result |
| --- | --- | --- |
| Admin | `GET /admin/fulfillment/handovers` | Up to 100 open cases |
| Buyer | `GET /orders/:id/handover` | Own case and public audit history |
| Owner | `GET /shops/:shopId/orders/:id/handover` | Shop case |
| Admin | `POST /admin/orders/:id/handover/proposal` | `{deadline, reason}` |
| Buyer | `POST /orders/:id/handover/response` | `{accept: true/false}` |
| Admin | `POST /admin/orders/:id/handover/stop` | `{reason, evidence}` |
| User | `GET /fulfillment/notices` | Last 100 notices addressed to this user |

`deadline` is an exact ISO timestamp. A proposal must leave the full 12-hour
buyer response window and be no more than 24 hours after proposal creation;
thus its fixed deadline is also within 24 hours after subsequent consent.
Only one proposal/extension is permitted. Consent never silently changes the
time shown to the buyer. The new deadline cannot be extended a second time.

No response, refusal, Admin SLA expiry or extension exhaustion starts safe
cancellation. No booking means atomic cancellation; a possible booking means
carrier reconciliation first. Observed pickup routes to an interception/return
request instead of unlocking stock. A pickup during the buyer response window
does not remove the buyer's choice. Late-refusal/timeouts do not enter the
buyer's self-cancellation counter or assign fault/fees.

Audit entries and buyer/current Owner notices are committed with each case
transition. The notice inbox is durable and available for frontend polling;
email, push, websocket delivery and UI are not implemented by this slice.
Handover/incident lists and the notice inbox accept `?offset=100` (0–100000),
returning up to 100 records per page. Continue until a page is empty.

## Unknown carrier cancellation

Thirty continuous minutes after the original cancel request, the worker opens
one carrier incident. Its Admin SLA is one business day from that original
threshold, excluding the incident day. An overdue flag never unlocks stock.

Admin uses `GET /admin/fulfillment/carrier-incidents` and
`POST /admin/fulfillment/carrier-incidents/:id/decision` with
`{outcome, reason, evidence}`. Outcomes:

- `KEEP_REVIEW`: record a direction and keep the case open.
- `CANCELLED_BEFORE_PICKUP`: Admin has independently verified GHN confirmation
  and supplies evidence. Only an approved COD cancellation still preparing,
  with no observed pickup/delivery/return/collection/transfer, can close this
  way. A timeout or seller statement alone is not sufficient evidence.

The manual decision records the Admin actor, time, reason and evidence. It does
not fabricate a GHN `providerStatus`. A later verified automatic cancellation
also closes its incident. Contradictory physical or payment evidence requires
further Admin reconciliation and cannot use this shortcut.

## Interception, physical return and inspection

The GHN sandbox return endpoint is called outside the database transaction.
Its per-waybill acknowledgement only confirms the request; subsequent verified
query state must report `returned`. A refused or unknown request keeps the
original waybill, locked inventory and review reason. The worker never creates
a replacement waybill to bypass uncertainty.

`carrierReturnedAt` records when Rewear observed a verified returned snapshot;
it is not an asserted exact physical event timestamp. The inspection deadline
is two business days from this recorded return, with coverage checks above.
Missing calendar and overdue inspection are visible on the shipment. Expiry
does not release inventory or infer the parcel's condition.

Owner calls `POST /shops/:shopId/orders/:id/shipment/return-inspection` with
`{condition: "SELLABLE" | "DAMAGED", reason, evidence}`. A verified uncollected,
undelivered COD return is required. One immutable inspection is saved; replay
of the same input is safe, a changed inspection conflicts.

Sellable inventory is reopened only when still owned by this order, the Shop
and category are active, and current product moderation is approved. Damaged
items remain hidden. Another order's reservation/sale is preserved and flagged
for review. Collected/transferred/delivered evidence or unresolved contradictory
carrier data keeps the case in Admin review, including repeated inspection
requests. These actions neither credit a wallet nor charge a fee or COD strike.

## Validation and remaining scope

Tests use a dedicated local PostgreSQL test database, real JWT/role HTTP checks,
mocked GHN responses and the GHN protocol contract. No live sandbox credentials
were exercised. The application continues to poll authenticated GHN queries;
an unsigned webhook cannot change state or money.

Manual evidenced COD collection/remittance reconciliation and funded Shop held
credits are implemented in [COD_RECONCILIATION.md](COD_RECONCILIATION.md).
The [72-hour settlement workflow](SETTLEMENT.md) now supports Admin-evidenced
delivery timestamps, receipt confirmation and safe internal ledger release.
Automatic bank feeds, exact carrier delivery event ingestion,
coins, general fee collection and frontend screens remain
separate implementation work. Existing moderation/package changes from main
are retained; COD placement and resale require `ProductModeration.APPROVED`.

[Wallet checkout and manual Shop payouts](WALLET_CHECKOUT_AND_PAYOUTS.md) now implement wallet spending and source-attributed withdrawals. [Verified disputes/returns](DISPUTE_RETURNS.md) cover post-adjudication remedies.


## Verified fees and debt update

[Fees and debt](FEES_AND_DEBT.md) now provides prior-disclosure snapshots, verified invoice assessment, Buyer wallet/MoMo payments, same-Shop available-fund offsets, objections/corrections and source refunds. New payout requests settle collectible Shop fees before allocation; existing payout locks remain protected. Missing legacy disclosure/waybill snapshots are not repaired automatically. Unsupported small provider refunds remain pending review rather than being reported completed.
