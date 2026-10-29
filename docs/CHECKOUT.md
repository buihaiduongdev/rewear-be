# Checkout reservation API

This increment creates provisional seller orders and a shared 10-minute reservation.
It does not accept payment, calculate shipping, or start seller fulfillment.
Shipping fees remain null and `paymentReady` is false. The subtotal is merchandise
only. This is not a completed purchase.

All routes require JWT and return the existing API envelope:

- `POST /api/checkouts`: `{ requestId, addressId, productIds }`; HTTP 200.
- `GET /api/checkouts/:id`: current buyer only.
- `POST /api/checkouts/:id/cancel`: idempotent cancellation by the buyer.

Only saved cart items are eligible. The address must belong to the buyer. The
selection is 1–50 distinct product UUIDs; unknown fields and client prices are
rejected. Unavailable items are removed from this checkout and that buyer's cart;
only product IDs and availability reasons are returned for removed items. An
all-unavailable selection records EMPTY with no deadline and no provisional orders.
System errors roll back the transaction rather than deleting cart items.

The backend reuses cart eligibility checks under product write locks, including
approved revision, category/source activity and self-purchase. It snapshots current
prices, approved cover images, product revisions and delivery address. It groups
items by personal seller or shop into `checkout_orders`, all linked to one checkout.
These are provisional orders, not paid or fulfillable orders. Address edits do
not change the saved snapshot. `addressId` is retained as an idempotency fingerprint.

`requestId` is unique per buyer. Repeating it with the same sorted selection and
address returns the original result/deadline, including terminal results; a changed
payload returns 409. To change a held checkout, cancel it first and issue a new
request ID. This revalidates all products. Multiple independent active sessions per
buyer are not additionally restricted in this increment; anti-abuse policy remains
open in CHECKOUT_DECISIONS.md.

Products store `reservationId` and `heldUntil`. Cancellation/expiry only release
HELD products whose reservationId still points to that checkout; stale work cannot
release a newer reservation. Reads and creation sweep overdue reservations, and
each API process runs a 30-second sweep. Deadlines use the database clock. Restarts
are safe because PostgreSQL owns reservation state. Products may remain visibly
HELD until a sweep/read reconciles the expired deadline, at most the sweep interval
while a process is healthy.

Lifecycle transactions currently use a shared PostgreSQL advisory lock before
product locks to serialize reservation changes across processes. This favors
correctness for the initial workload; the expiry sweep is not yet batched. Before
scaling, partition lifecycle locking and batch expiry with contention measurements.
The 600-second value is snapshotted per checkout; admin-managed settings are a later
increment. Future payment confirmation must participate in the same lifecycle
locking/ownership protocol before payment endpoints can be enabled.

## Verification

Use Node 24.9+ and a dedicated local database named `rewear_checkout_test`:

```bash
CHECKOUT_TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/rewear_checkout_test pnpm test:e2e --runInBand --runTestsByPath test/checkout.e2e-spec.ts
```

The suite creates and drops a unique schema and uses real HTTP, TypeORM and
PostgreSQL; only JWT is replaced with a fixture identity. Browser validation uses
real JWT and a separate disposable development database. CI skips the database
suite when its URL is absent, as requested. No applied migration was modified;
new tables/columns follow the existing dev synchronize policy.
