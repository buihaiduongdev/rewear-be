# Sandbox shipping estimates

`POST /api/checkouts/:id/shipping-quotes` accepts an empty object and requires the
checkout buyer's JWT and an unexpired HELD checkout. `GET /api/checkouts/:id`
returns the latest effective `shippingQuote` without contacting the carrier.

Each checkout source (personal seller or shop) is one parcel and one fee. Rotate
each declared box to descending edges, take the maximum length/width and sum
heights and weights (`BOUNDING_STACK_V1`). This conservative estimate is not a
packing guarantee. Missing packages or totals over 50 kg / 200 cm per edge are
unavailable; the system never silently splits parcels. Declared value above
5,000,000 VND is unsupported by this adapter.

Quotes expire after at most 120 seconds and never outlive the checkout hold.
Fresh READY results and recent identical FETCHING requests are reused. Partial
results expose available per-source fees but no combined fee/grand total. Expiry,
cancellation, changed pickup inputs or superseding refreshes invalidate stale
fees. Only the latest generation is exposed on the checkout. Private pickup and
provider input snapshots stay server-side.

Provider HTTP runs outside database transactions, with four concurrent requests,
an eight-second shared budget and three-second individual request deadlines.
Address names must map uniquely to active GHN directory names/aliases; ambiguous
matches fail rather than guess.

## Configuration

Opt in with server-only `GHN_SANDBOX_ENABLED=true`, `GHN_SANDBOX_TOKEN`, and
`GHN_SANDBOX_SHOP_ID`. With missing configuration, estimates return
`CARRIER_NOT_CONFIGURED`; no zero fee is substituted. The adapter is pinned to
GHN staging and calls shipping-order **preview**, never create. Payer is the
platform (1), COD is zero. Credentials/provider errors are not returned to buyers.

The UI labels sandbox estimates and keeps payment disabled. No carrier booking,
paid order, shipping registration, production carrier or settlement is implemented.
The existing checkout order's `shippingFee` remains null; estimates are separate
versioned records. New nullable checkout pointer and quote table use the existing
development schema synchronization policy; a production migration remains outside
this development feature.

## Verification

Unit tests cover parcel aggregation and the real adapter with mocked upstream
fetch responses. Checkout HTTP/PostgreSQL tests replace only the upstream adapter
and cover ownership, concurrency, expiry, invalidation and privacy. The Cypress
shipping-quote spec uses disposable local API port 5014, UI port 5015, real JWT,
PostgreSQL and GHN sandbox preview. Never point its fixture mutations at shared DBs.
