# Paid Shop orders: seller acceptance

This backend slice implements SELLER-SESSION-01/02, ORDER-SESSION-01 and
REFUND-SESSION-02 from `docs/submission_docs/DECISIONS.md`.

## API

All routes require an active user's Bearer JWT. Responses keep the standard
`{ statusCode, message, data }` wrapper.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/orders/mine` | Buyer's orders |
| GET | `/api/orders/:id` | Buyer's order detail, history and wallet credit |
| GET | `/api/shops/:shopId/orders` | Shop's orders |
| GET | `/api/shops/:shopId/orders/:id` | Shop order detail |
| POST | `/api/shops/:shopId/orders/:id/accept` | Accept with body `{}` |
| POST | `/api/shops/:shopId/orders/:id/reject` | Reject with `{ "reason": "Cannot fulfil" }` |
| GET | `/api/wallet/mine` | Current refund balance and credit history |

Lists return arrays; order lists support optional `status`, `limit` (1–100,
default 100), `offset` (0–100000, default 0). Wallet history supports the same
pagination without a status filter. Lists are newest-first with UUID tie-breaker.
The existing `/orders/mine` URL is preserved but now serializes preparing and
cancelled orders too. Clients must regenerate their API types.

The Shop's active Owner membership is checked on each request; mutations hold
a shared lock on that membership while checking and changing the order. The
existing Shop code has no configurable permission resolver, so Staff is denied
until that RBAC foundation is integrated. Shop inactivity does not remove the
Owner's ability to process existing orders, but prevents automatic resale.

## State and money

Successful MoMo settlement creates one `pending` order per Shop and a deadline
24 continuous hours from settlement. Before that deadline, acceptance changes
the order to `preparing`. Repeating acceptance is safe; rejecting an accepted
order conflicts. A rejection needs a nonblank reason of at most 1000 characters.

At/after the database deadline, a pending order is cancelled and its total
(goods plus shipping in the current payment slice) credited to the buyer's
refund-only Rewear wallet. An expired acceptance request returns 409 **after**
that cancellation commits. Rejecting after the cutoff records timeout rather
than a seller rejection. Other Shop orders continue.

The order, immutable credit, wallet balance, eligible stock release and order
event commit in one PostgreSQL transaction. Unique order credit and serialized
lifecycle operations prevent double refunds. A failed transaction leaves the
order pending and safely retryable. Original checkout/payment remain PAID;
replayed provider success cannot create a second order or refund. These are
internal cancellation refunds, distinct from the MoMo refund worker for late,
wrong or duplicate provider captures.

`OrderWorker` checks up to 100 overdue orders every 30 seconds even when MoMo
is disabled. Failures are logged, rolled back and backed off for 60 seconds so
other orders can proceed. This interval is not a guarantee under infrastructure
outages or large backlogs. In-app/email delivery and operational SLA escalation
remain a separate notification feature; order events are an audit trail.

## Stock and schema

Payment settlement records `products.soldOrderId`. Cancellation only releases
stock still owned by that exact order, without an unrelated reservation. A
current approved revision and active Shop/category are required for automatic
ACTIVE resale; ineligible SOLD stock becomes HIDDEN. Suspended/other states
are preserved. Missing, inconsistent or historical ownership markers leave
stock untouched and record `stockReleaseReviewIds` for reconciliation.

The Order entity now lives in `src/modules/order/order.entity.ts`; the existing
`orders` table is retained. Added tables are `order_events`, `wallet_accounts`
and `wallet_credits`, plus nullable order metadata and product ownership.
TypeORM synchronization remains the repository's current development setup;
production data migration and historical ownership reconciliation are not
performed by this change. No development database reset is required for tests.

## Verification and limits

Tests use a dedicated local `rewear_test` PostgreSQL database. They cover
cross-user/Shop isolation, concurrent mutations, expired acceptance, a deadline
crossed while waiting for membership, partial checkout cancellation, full wallet
credit, stock eligibility/ownership, financial rollback, worker error isolation,
capture replay, plus an HTTP flow with real JWT authentication and validation.

Current scope stops at `preparing` or `cancelled`. The nine-state type reserves
the remaining shipment/dispute states, but no arbitrary state-update route is
exposed. COD, GHN waybills, buyer cancellation after acceptance, 72-hour
settlement, coins, wallet spending, withdrawals and full Shop RBAC are later
slices. Existing orders have no coin discounts, so cancellation credits the
saved order total; future coin integration must follow REFUND-SESSION-02 rather
than blindly refunding only net cash.
