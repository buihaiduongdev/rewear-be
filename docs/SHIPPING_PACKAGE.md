# Listing package details

Sellers may choose preset upper bounds or enter custom packed weight and outer
dimensions, independently. This prepares parcel data for future shipping quotes;
it does not calculate fees or create carrier shipments.

## API

- `GET /api/shipping/package-options` returns public preset IDs, labels, upper
  bounds and custom input limits.
- `PATCH /api/shipping/products/:id/package` requires the listing owner's JWT.
  The body is the package object below; the response is the normal product envelope.
- Product create/update also accept `shippingPackage`; general product update can
  set it to `null` to clear it. Existing products remain `null` until declared.

```json
{
  "weight": { "mode": "RANGE", "preset": "UP_TO_500_G" },
  "size": { "mode": "CUSTOM", "lengthCm": 20.1, "widthCm": 15.5, "heightCm": 8 }
}
```

Custom weight uses `{ "mode": "CUSTOM", "grams": 600 }`; preset size uses
`{ "mode": "RANGE", "preset": "BOX_30_20_15_CM" }`. Enumerate available IDs
through package-options. Preset IDs have fixed meanings; introduce a new ID rather
than changing an existing bound. Unknown keys and forged preset values are rejected.

Weight must be a positive integer up to 50,000 g. Each custom dimension must be
positive and at most 200 cm. These are application input limits; a carrier may
impose stricter bounds. Presets resolve to their upper bounds. Custom dimensions
round upward to whole centimetres; no weight is guessed from the category.

## Lifecycle and checkout

Package edits use the existing ProductService transaction and ownership checks.
HELD, SOLD and SUSPENDED products cannot be edited. A meaningful package change
increments the revision, clears approval and returns the listing to DRAFT, including
from PENDING_REVIEW. Repeating an identical package does not increment the revision,
including after PostgreSQL JSONB has reordered object keys.

Submission snapshots the seller's raw choices in ProductRevision. Checkout snapshots
resolved `weightGrams`, `lengthCm`, `widthCm`, `heightCm` per item under its product
lock. Legacy product/checkout data without a package serializes as `null`.

Missing package data currently does not block submission or reservation. Before
enabling quotes/payment, define required package coverage, seller pickup addresses,
carrier address mapping and parcel aggregation for multiple products from one seller.
Per-item dimensions do not describe a combined shipment. Shipping fees remain null
and payment remains disabled.

The nullable JSONB column follows the repository's current development synchronize
policy. No migration or shared database was applied by this increment.

## Verification

Unit tests cover upper bounds, upward rounding and invalid weights. Real PostgreSQL
product/checkout tests cover validation, owner access, reserved-state protection,
revision idempotency, submitted choices and resolved checkout snapshots. Use the
dedicated databases documented in PRODUCT_LIFECYCLE.md and CHECKOUT.md. CI continues
to skip database suites when their explicit test URLs are absent.
