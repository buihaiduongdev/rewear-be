# Receipt confirmation and 72-hour Shop settlement

Implemented locally on 2026-11-16. Internal ledger release is not a provider
escrow service or bank payout. No live provider credentials are required.
MoMo remains Sandbox: its credits and releases are always SIMULATION.

## Buyer receipt

`POST /orders/:id/confirm-receipt` accepts `{}` and requires the order's buyer.
Authenticated carrier data must already confirm delivery with no blocking
fulfillment review, cancellation or return. The endpoint stores
`receiptConfirmedAt`, sets completed, and writes one RECEIPT_CONFIRMED event.
Replays are safe. Buyer cannot submit a deadline, delivery time or amount.
Acknowledgement never releases money early or waives the full dispute window.
Acknowledging after automatic completion does not generate a second release.

## Verified delivery time

Polling records `deliveryObservedAt`, the first delivered observation. GHN
updated_date and pickedObservedAt are not verified delivery/pickup event times.
Polling alone cannot establish the payout deadline. Until exact carrier event
ingestion is verified, Admin uses SETTLEMENT-REVIEW-02's evidence exception:

`POST /admin/orders/:id/delivery-verification`

```json
{
  "deliveredAt": "2026-11-16T08:00:00.000Z",
  "mode": "SIMULATION",
  "reason": "Delivery timestamp checked against carrier receipt",
  "evidence": "Private signed delivery receipt reference"
}
```

Admin must independently check the source. Saving evidence does not itself
validate an external document. Delivery must not precede order creation or
exceed the database clock/first delivered observation. Observed pickup time
is deliberately not used as a lower bound. Existing carrier/order safety
checks must also pass.

The immutable record stores delivery time, disputeDeadlineAt (72 continuous
hours later, including weekends), mode, Admin, reason and evidence. Orders
expose deliveryVerifiedAt, disputeDeadlineAt and receiptConfirmedAt. Private
evidence stays out of buyer events and Shop finance. Identical verification
replay is safe; changed replay conflicts. Correcting mistaken verification
needs a future audited review flow. No unverified legacy dates are backfilled.

## Completion and release

Worker: 30-second interval, 100 outstanding orders per tick, keyset traversal
past blocked/failing rows, and exclusion of orders with an existing settlement.
Failed transactions retry on a later sweep. At a verified deadline, a safe
delivered order completes even if COD remittance has not arrived. Completion
and available money are separate.

Release additionally requires:

- delivered/completed state, no dispute/returns, unresolved cancellation,
  unsafe carrier data, return or handover review;
- unchanged delivery/deadline snapshot, full 72-hour window, matching modes;
- no wallet refund for the order;
- COD: unchanged order/waybill fingerprint, full verified collection and full
  receipt (cash plus evidenced approved fee netting), exact Shop/net held credit.
  Partial receipt never releases partially;
- MoMo: matching PAID checkout and capture, buyer, amount, order snapshot and
  current fixed commission policy; payment before delivery; no refund of the
  original capture. Refund of an extra duplicate capture does not freeze the
  valid original. All MoMo Sandbox credits remain SIMULATION.

Commission follows existing per-item integer rounding; shipping is excluded
from seller revenue. Immutable shop_settlements references the held credit.
Unique order/credit constraints and the existing commerce advisory lock prevent
duplicate release. Completion, release and events commit together; no HTTP
request runs inside the transaction.

## Shop finance

`GET /shops/:shopId/finance?mode=EVIDENCE` remains active-Owner-only. It returns
held = funded credits minus releases, available = releases, receivables and
paged safe settlements alongside credits/collections. Default EVIDENCE excludes
simulation values. Reads use one repeatable-read snapshot and safe amount
validation. This API does not yet allow withdrawing/spending available money.

## Follow-up integration

[Dispute intake, evidence and party responses](DISPUTES.md) now establish durable
case holds under the same commerce lock, including timely disputes after early
completion. Release also checks open issue records directly. [Adjudication](DISPUTE_ADJUDICATION.md), [appeals](DISPUTE_APPEALS.md) and
[eligible dispute wallet refunds](DISPUTE_REFUNDS.md) are implemented. Return
verification and carrier remedies are documented in [Returns](DISPUTE_RETURNS.md).
[Wallet checkout and manual bank payouts](WALLET_CHECKOUT_AND_PAYOUTS.md) now track held withdrawals and late-refund debt per source. General fee corrections, coins,
exact GHN event ingestion and live Sandbox verification remain separate work.

Tests: integration, e2e and unit `order-settlement.spec.ts` suites, dedicated
local PostgreSQL, real HTTP/JWT permission checks and exact time boundaries.

## Wallet refund execution update

[Exact-amount refund execution](DISPUTE_REFUNDS.md) queues final plans, credits eligible wallets and adjusts seller settlement. [Verified return/safety/carrier workflows](DISPUTE_RETURNS.md) establish execution prerequisites.
