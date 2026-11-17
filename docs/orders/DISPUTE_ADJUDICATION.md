# Initial Admin adjudication

This slice records an immutable first decision for each valid issue. It does
not execute refunds, release Shop funds, waive returns or complete appeals.
The entire order remains held in AWAITING_APPEAL until later workflows can
resolve the decision and all related issues safely.

## Review and decide

Both routes require an active Admin:

- `GET /admin/dispute-issues/:id/review?offset=0`
- `POST /admin/dispute-issues/:id/decision`

Review returns the issue, original order item price, submitted evidence metadata,
messages, total message count, optional existing decision and a reviewToken.
Messages are paged in groups of 100. All pages share the same token for the
same snapshot; new evidence, replies or changed commerce snapshots invalidate
the token, including changes beyond the first page. Admin must inspect the
relevant files through the existing private download API and review all pages.
A token proves the snapshot has not changed; it does not prove a human read it.

```json
{
  "requestId": "a-new-request-UUID",
  "reviewToken": "the-64-character-token-from-review",
  "outcome": "REQUIRE_RETURN",
  "responsibility": "SELLER",
  "reason": "Received item does not match the order listing",
  "evidenceAssessment": "Explain how the buyer photos, listing and seller response were assessed"
}
```

Outcomes:

- REJECT_CLAIM: the claim is not upheld, with an explicit reason. It does not
  automatically establish buyer fraud/fault, add fees or release seller funds.
- REQUIRE_RETURN: the supported return-for-refund direction for established
  seller fault. This records the direction only; no shipping label, refund or
  return deadline starts here. It is forbidden for MISSING_ITEM because an
  absent item cannot be returned.
- UPHOLD_CLAIM: records a supported factual finding while leaving the remedy
  for the following workflow. This can cover a proven missing-item issue. It
  does not itself waive a return, authorize compensation or create a refund.

Responsibility values: SELLER, BUYER, CARRIER and UNDETERMINED. These are Admin
findings supported by the required assessment, not automatic conclusions from
silence, status codes or video. The API refuses arbitrary refund amounts,
forced partial refund options and unsupported no-return exceptions.

An issue must be ACTIVE in an OPEN case with a dispute order. Admin must wait
until the stored seller-response deadline has passed, even if the seller has
already replied. If the deadline cannot be established from an approved
calendar, the service refuses to invent it. Late Admin decisions are recorded
with reviewLate rather than silently stopping or resetting the SLA.

## Snapshot, idempotency and money

Under the shared commerce advisory lock, the service rechecks the Admin,
database clock, case/order hold, fresh token and absence of a financial release.
It records decision, issue transition, audit and durable buyer/Shop/Admin
notices in one transaction. A storage/audit failure rolls back the whole action.
Concurrent identical request UUIDs produce one decision. Changed replay,
request reuse for another issue and a second initial decision conflict. No
endpoint overwrites the initial outcome, responsibility, assessment or basis.

The private basis stores evidence/message IDs, item/Shop/buyer snapshots and
source deadlines. Ordinary party supplementation/replies freeze after decision;
new evidence belongs to the subsequent appeal workflow. Parties can prepare
private unsubmitted appeal evidence within the snapshotted appeal window.

itemPrice is an immutable per-item ceiling, not a payable amount. Different
issues involving the same item share remedyKey = orderId:productId. Future
refund execution must resolve remedies by item and never add issue ceilings
as separate refunds. Shipping, commission corrections, wallet credits and
bank payouts are not executed by this slice.

## Appeal window and retained holds

The durable notice timestamp starts the two-business-day appeal window,
excluding notice day and approved Vietnam holidays, ending at 17:00 Vietnam
time. If calendar coverage is missing, appealUntil remains null and
calendarMissing is explicit. Worker recovery derives it from the original
notice time without restarting the clock or changing the original decision.

AWAITING_APPEAL is part of the shared open-hold state list. Settlement checks
the persisted issue even if the order status is accidentally changed. Expiring
another incomplete issue cannot close the case or free its funds. Passing the
appeal deadline alone does not trigger a refund/release in this slice.

Accepting appeals, combined review of both parties, final decisions, remedy
execution and actual return/refund flows are the next steps. There is no claim
that those workflows exist or that money can now move automatically.

## Responses and tests

Case detail now includes safe decisions with the public reason, assessment,
responsibility and appeal deadline. It excludes request fingerprints, private
basis, storage keys and object ETags. Buyer/Owner cannot call Admin routes.

Tests use dedicated local PostgreSQL and real JWT HTTP checks. They cover
immutable replay/races, stale paged reviews, waiting for seller response,
calendar recovery, multi-issue holds, rollback and missing-item return guards.
No external provider calls are required or claimed.
