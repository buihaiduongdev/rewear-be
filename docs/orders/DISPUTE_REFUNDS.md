# Dispute wallet refund execution

Implements the exact-amount option A approved on 2026-11-19. This slice is wallet
execution after final adjudication, not a generic credit/top-up endpoint or a
second default Admin disbursement approval.

## Decision contract

Initial and appeal conclusion bodies may carry refundPlan:

    { "amount": 100001, "condition": "MISSING_ITEM" }

amount is integer VND, positive and capped at the snapshotted pre-coin item price.
No shipping is implicitly refunded by an item plan. REJECT_CLAIM forbids a plan.
REQUIRE_RETURN accepts RETURN_REQUIRED; UPHOLD_CLAIM cannot claim return readiness.
Conditions are exported constants:

| Condition | Execution prerequisite |
| --- | --- |
| MISSING_ITEM | Accepted missing-item finding, full item amount, verified payment |
| PARTIAL_AGREEMENT | Strictly partial amount and durable acceptance of that exact final plan by both parties |
| SELLER_WAIVER | Full item amount and exact-plan acceptance by the Shop Owner; no extra buyer confirmation |
| RETURN_REQUIRED | Verified return/inspection, accepted objection resolution or an independently verified equivalent return duty |
| SAFETY_WAIVER | Concrete safety instructions, new buyer execution proof and fresh Admin verification |

Missing-item issues may also use a voluntary partial agreement, but cannot
require return of the missing item. Seller liability and explicitly verified carrier remedies are supported by
[Returns and exceptions](DISPUTE_RETURNS.md); other unverified liability remains held. No unsafe return-ready or paid boolean is accepted from clients.

The nullable optional field preserves old API clients/rows; null creates no
financial entitlement. New clients must send the approved plan to enable payment.
Old records are never rewritten or inferred from itemPrice. Appeal conclusions
record their own plan rather than inheriting a different original outcome's plan.
Original-unappealed finalization copies the exact original plan.

## API and consent

All paths below use the application's /api prefix:

- GET /dispute-final-decisions/:id/refund: buyer/Shop Owner view with exact plan,
  planToken, approvedSellerDebit, execution state and safe ledger/incident history.
- GET /admin/dispute-final-decisions/:id/refund: active Admin equivalent.
- POST /dispute-final-decisions/:id/refund/consents with { planToken }: immutable,
  idempotent buyer/Owner acceptance for partial remedies and Owner acceptance for seller waivers. The token
  binds the final ID, remedy key, amount and condition. No default payment approval.
- POST /admin/dispute-final-decisions/:id/refund/refresh with {}: retry/re-evaluate
  prerequisites; it cannot override them or invent a payment/return proof.
- POST /admin/dispute-refunds/:id/incident-updates with requestId, statusNote,
  stepsTaken and nextUpdateAt: substantive, immutable/idempotent incident response.

approvedSellerDebit is the approved cumulative item remedy's seller debit; if
another issue already paid some of the same item's entitlement, actual new debit
can only decrease. The plan is a cumulative entitlement for that item, not another
additive discount. Both parties see the exact amount and this maximum debit before
consent. Consents do not accept a later changed final plan. Public serializers omit
fingerprints, private provider/storage references and evidence object metadata.

## Ledger, holds and source accounting

Finalization atomically queues a refund obligation; a separate worker evaluates
it every second and executes without buyer resubmission. Eligibility is persisted
before attempting money writes. Wallet, immutable refund credit, seller deduction,
issue resolution and notices commit atomically under the existing commerce lock.
No HTTP provider request occurs inside that transaction.

For the same order/product remedyKey, new credit is max(0, entitlement - already
credited). Independent issue ceilings are never added. A zero credit means that
another issue already fulfilled the entitlement; it does not increase the wallet.
Remaining issues keep their holds. Only when all issue holds clear does case/order
restoration run; ordinary 72-hour/verified-funding settlement rules still apply.

Commission reversal is the difference between floor(price * snapshotRate) before
and after the cumulative item refund. Seller debit equals refund minus reversed
commission. It is deducted only from that order/shop/mode: pending COD receivable,
then held credit when funding arrives, then the reduced settlement. Existing
immutable settlement records snapshot refundDebit so later linked adjustments
are not charged twice. No unrelated Shop order pool is used to fund a shortage.

COD delivered alone is insufficient. The immutable evidenced collection must
match order snapshot, waybill, party, amount and commission. Verified buyer payment
does not wait for remittance. Order-specific received cash first reserves remaining
shipping (shippingFee minus evidenced fee netting); the remainder covers item
refunds. Incoming cash first recovers prior refunds/advances on this order before
funding another refund. advanceAmount records the historical execution shortfall,
not a live outstanding debt balance. Original COD collection/remittance accounting
continues; this is not a second collection claim against buyer or seller.

MoMo reuses the exact original capture/snapshot/refund guards. Refund of an extra
duplicate capture does not block a valid primary capture. All current MoMo Sandbox
refunds, and explicitly simulated COD refunds, credit simulationBalance; they never
increase spendable evidence balance. Wallet mine exposes both balances and tagged
refund history. Cancellation refunds reject overlapping dispute credits at the
money-write boundary; existing cancellation semantics otherwise remain unchanged.

## SLA, failures and limits

Target: normal internal refund within five seconds. The worker polls every second;
this is scheduling intent, not a measured production performance guarantee.
Operational SLA is five minutes from all prerequisites being met, based on original
finality, verified source and relevant consent timestamps. Failed writes preserve
eligibleAt and dueAt. Overdue work alerts buyer/Shop/Admin once, continues safe
retries, and records a four-continuous-hour Admin response target. Incident updates
record the actual status, actions and next update, not a claim that money moved.

PostgreSQL uniqueness, shared locking and immutable credit receipts protect replays
and concurrent workers. An infrastructure outage can also delay persisted alerts;
there is no external monitoring/SMS guarantee in this slice. This adds a durable
in-app notice inbox, not an email/push delivery system.

The project currently uses TypeORM synchronize; no production migration, historical
financial repair or development database reset was performed. Tests exclusively
use rewear_test. Live MoMo/GHN/storage verification, coins, wallet checkout and bank payouts remain separate work.
Return labels/inspection, safety and evidenced carrier compensation are implemented in [DISPUTE_RETURNS.md](DISPUTE_RETURNS.md).

## Post-adjudication return update

[Returns and verified exceptions](DISPUTE_RETURNS.md) now provide reverse booking, handover/inspection/objection clocks, safety execution verification, carrier loss/refusal remedies and independent evidenced compensation. These feed exact wallet refund conditions; no live provider or external bank payment is claimed.
