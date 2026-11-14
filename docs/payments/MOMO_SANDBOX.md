# MoMo Sandbox — backend payment slice

## Implemented path

1. Create an authenticated checkout and preview shipping fees.
2. `POST /api/checkouts/:id/payments/momo` with `{ "requestId": "<uuid>" }`.
   The backend obtains a fresh READY GHN quote outside the payment transaction,
   rechecks the active hold and Shop stock, snapshots the full server total, then persists an
   attempt before calling MoMo. Never submit an amount, fee, credential or URL
   from the frontend. Reusing the same request ID returns the existing attempt.
   A server quote older than 30 seconds or incomplete shipping results block a
   new attempt. The amount returned with the attempt is authoritative; the
   frontend must display it before opening MoMo. Fees can differ from a prior preview.
3. Open the returned `payUrl`. This is not payment confirmation.
4. A signed `POST /api/payments/momo/ipn` or server status query verifies payment.
   Settlement shares checkout's PostgreSQL lifecycle lock with cancellation and
   expiry. One transaction marks stock sold, changes checkout to PAID and creates
   one pending order per Shop with a 24-hour seller confirmation deadline.
5. `GET /api/payments/:id` reads the buyer's attempt and refund obligations.
   `POST /api/payments/:id/reconcile` requests server reconciliation, subject to
   the persisted schedule/lease. `GET /api/orders/mine` returns up to 100 recent
   pending orders for the authenticated buyer.

IPN returns 204 only after durable processing. Invalid signatures/references are
rejected. Redirect query parameters never settle a payment. Signed notification
fields are checked against the attempt. The worker queries unresolved payments,
including after expiry; HTTP failure is unknown, not a payment failure.

## Late, wrong or duplicate money

Verified captures after cancellation/expiry, incorrect amounts and additional
captures create durable refunds identified by the actual provider transaction.
They do not revive checkout or create another order. Each refund is persisted
before submission with a stable refund order/request ID distinct from payment.
After a timeout the worker queries that refund rather than submitting another.
Confirmed refund completion is recorded; unsupported amounts and definitive
refund failures require review instead of unsafe blind retries.

## Configuration

Copy only the variable names/placeholders in `.env.example`; keep actual keys
in local environment or deployment secrets. `MOMO_ENABLED=false` by default.
Enabling requires all of:

- `MOMO_PARTNER_CODE`, `MOMO_ACCESS_KEY`, `MOMO_SECRET_KEY`: Sandbox credentials.
- `MOMO_IPN_URL`: public HTTPS backend URL ending in `/api/payments/momo/ipn`.
- `MOMO_REDIRECT_URL`: HTTPS frontend result page; it reads payment status from
  the backend rather than trusting redirect values.
- `MOMO_TIMEOUT_MS`: 30000–60000, default 30000.

Outbound API host is fixed to `https://test-payment.momo.vn`; production is not
enabled by this slice. No real credentials are committed. Do not enable payment
on a database containing important data before reviewing schema changes: this
repository still uses TypeORM synchronization, not a production migration rollout.

## Verification and integration limits

Run `pnpm test:payment:core` (or `node --test test/payment-*.node.test.mjs`) on
Node 24. Protocol/policy tests run directly; service/worker tests execute their
TypeScript bodies with framework decorators erased and fake persistence. They
do **not** prove PostgreSQL locking, transactions or Nest dependency injection.

`test/integration/payment.spec.ts` exercises real PostgreSQL settlement and
duplicate notifications. Run `pnpm check` and `pnpm test` with the dedicated
local test database described in the root README before enabling Sandbox.
After installing dependencies, TypeScript checking and Nest build passed; all
23 Jest suites (140 tests) and 22 Node tests passed for the original payment slice. The PostgreSQL payment suite
includes concurrent duplicate notifications, cancelled checkout success, wrong
amount and buyer access isolation against a real dedicated local database. Oxlint passed. Prettier
passed with `--end-of-line auto` for existing Windows checkouts; changed source
files were formatted normally. PostgreSQL 18 was used with dedicated database
`rewear_test`; development data was not used for test resets. CI uses PostgreSQL
16 and still needs its own result. The test run emitted a pg deprecation warning
about overlapping queries on a client; no test failed. No live MoMo success is
claimed: provider HTTP is mocked in automated tests.

The following remain outside this first payment slice:

- Seller confirmation processing, automatic 24-hour order cancellation, shipping,
  escrow release, wallet/coin settlement and their ledgers/UI.
- Admin incident UI, customer notifications and safe operator-assisted retries
  after a definitive refund rejection. Refund incidents are persisted via state
  and `alertedAt` and logged; logging alone is not the complete notification SLA.
- An operational end time for unknown payments: reconciliation continues rather
  than discarding unresolved money; provider limits and operator escalation still
  need Sandbox verification.
- Current checkout's `paymentReady` remains the legacy display flag. Frontend
  integration and enabling the payment affordance require follow-up; do not infer
  this endpoint set is an end-to-end released UI.

## Provider references

- [Wallet one-time create and HMAC fields](https://developers.momo.vn/v3/docs/payment/api/wallet/onetime/)
- [IPN signature checks and 204 acknowledgement](https://developers.momo.vn/v3/docs/payment/api/result-handling/notification/)
- [Server transaction query](https://developers.momo.vn/v3/docs/payment/api/payment-api/query/)
- [Refund and refund query](https://developers.momo.vn/v3/docs/payment/api/payment-api/refund/)
- [Result code semantics](https://developers.momo.vn/v3/docs/payment/api/result-handling/resultcode/)

Result 0 is captured success. This implementation conservatively reconciles
9000 authorization/other ambiguous results instead of fulfilling without a
confirmed capture. Real Sandbox behavior for autoCapture must be checked.

## PR #32 compatibility verification

The combined Shop refactor and payment code passed typecheck, Nest build,
Oxlint, formatting and 23 Jest suites / 146 tests on local PostgreSQL 18, plus
22 Node tests. Payment integration now runs the real pricing and shipping
services with mocked carrier HTTP: fresh fees/current Shop name, unavailable
shipping, cancellation during quoting, idempotent replay and settlement are
covered. The GHN request runs before the shared transaction lock. No local
development database was reset and no live provider transaction was performed.
